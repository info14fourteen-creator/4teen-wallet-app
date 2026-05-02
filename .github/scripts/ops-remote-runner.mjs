import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Trigger refresh to validate the wallet GitHub runner against a live confirmed request.
// This line is intentionally harmless and can be nudged to wake the workflow.
// Another harmless wake-up marker for deploy smoke.
const REPO_KEY = 'wallet-app';
const RUNNER_ID = process.env.OPS_EXECUTOR_RUNNER_ID || 'github-actions-wallet-app';
const DEFAULT_BASE_URL = 'https://fourteen-wallet-api-7af291023d36.herokuapp.com';
const DEFAULT_BRANCH = process.env.GITHUB_REF_NAME || 'main';
const DEFAULT_AUDIENCE = process.env.OPS_GITHUB_OIDC_AUDIENCE || '4teen-ops-runner';
const MAX_ALLOWED_FILES = 6;
const MAX_FILE_CHARS = 35_000;

function normalizeValue(value) {
  return String(value || '').trim();
}

function log(step, payload = {}) {
  process.stdout.write(`[ops-remote-runner] ${step} ${JSON.stringify(payload)}\n`);
}

function fail(message) {
  throw new Error(message);
}

function getEnv(name, options = {}) {
  const value = normalizeValue(process.env[name]);
  if (!value && options.required) {
    fail(`Missing required env: ${name}`);
  }
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });

  if (result.status !== 0) {
    const error = new Error(
      `Command failed: ${command} ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`.trim()
    );
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.status = result.status;
    throw error;
  }

  return (result.stdout || '').trim();
}

function getBaseUrl() {
  return getEnv('OPS_EXPORT_BASE_URL') || DEFAULT_BASE_URL;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

let cachedControlToken = null;

async function fetchGithubOidcToken() {
  const requestUrl = getEnv('ACTIONS_ID_TOKEN_REQUEST_URL', { required: true });
  const requestToken = getEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', { required: true });
  const separator = requestUrl.includes('?') ? '&' : '?';
  const audience = encodeURIComponent(DEFAULT_AUDIENCE);
  const response = await fetch(`${requestUrl}${separator}audience=${audience}`, {
    headers: {
      Authorization: `Bearer ${requestToken}`
    }
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.value) {
    throw new Error(payload?.message || `Failed to fetch GitHub Actions OIDC token (${response.status})`);
  }
  return payload.value;
}

async function getControlToken() {
  if (getEnv('ADMIN_SYNC_TOKEN')) {
    return getEnv('ADMIN_SYNC_TOKEN');
  }

  if (!cachedControlToken) {
    cachedControlToken = await fetchGithubOidcToken();
  }

  return cachedControlToken;
}

async function requestControl(pathname, init = {}) {
  const token = await getControlToken();
  const response = await fetch(`${getBaseUrl().replace(/\/+$/, '')}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  const payload = await readJson(response);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Control plane request failed with status ${response.status}`);
  }
  return payload;
}

async function claimNextRequest() {
  for (const actionType of ['apply', 'publish', 'deploy', 'restart']) {
    const payload = await requestControl('/ops/execution-requests/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        repoKey: REPO_KEY,
        actionType,
        runnerId: RUNNER_ID
      })
    });

    if (payload?.result?.id) {
      return payload.result;
    }
  }

  return null;
}

async function fetchRequestWorkOrder(requestId) {
  const payload = await requestControl(`/ops/execution-requests/${encodeURIComponent(requestId)}/work-order`);
  return payload?.item || null;
}

async function fetchRunnerConfig(requestId) {
  const payload = await requestControl(`/ops/execution-requests/${encodeURIComponent(requestId)}/runner-config`);
  return payload?.result || null;
}

async function requestServerApplyPlan(requestId, fileSnapshots) {
  const payload = await requestControl(`/ops/execution-requests/${encodeURIComponent(requestId)}/apply-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileSnapshots
    })
  });
  return payload?.result || null;
}

async function finishRequest(requestId, status, summary, resultMessage, details = null) {
  return requestControl(`/ops/execution-requests/${encodeURIComponent(requestId)}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status,
      summary,
      resultMessage,
      runnerId: RUNNER_ID,
      details
    })
  });
}

function remoteBranchExists(branchName) {
  const output = run('git', ['ls-remote', '--heads', 'origin', branchName]);
  return Boolean(output);
}

function ensureTaskBranch(branchName) {
  run('git', ['fetch', '--all', '--prune']);
  if (remoteBranchExists(branchName)) {
    run('git', ['checkout', '-B', branchName, `origin/${branchName}`]);
    return;
  }

  run('git', ['checkout', '-B', branchName, `origin/${DEFAULT_BRANCH}`]);
}

async function loadCandidateFiles(workOrder) {
  const candidates = Array.isArray(workOrder?.proposedFiles) ? workOrder.proposedFiles : [];
  const existing = [];

  for (const relativePath of candidates) {
    if (existing.length >= MAX_ALLOWED_FILES) {
      break;
    }

    const safePath = normalizeValue(relativePath).replace(/^\/+/, '');
    if (!safePath) {
      continue;
    }

    const absolutePath = path.resolve(process.cwd(), safePath);
    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      existing.push({
        path: safePath,
        content: content.slice(0, MAX_FILE_CHARS)
      });
    } catch {
      continue;
    }
  }

  return existing;
}

function validateChanges(plan, allowedPaths) {
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  const allowed = new Set(allowedPaths);

  for (const change of changes) {
    const safePath = normalizeValue(change?.path).replace(/^\/+/, '');
    if (!allowed.has(safePath)) {
      throw new Error(`Runner refused to modify non-allowed path: ${safePath || '<empty>'}`);
    }
  }

  return changes.map((change) => ({
    path: normalizeValue(change.path).replace(/^\/+/, ''),
    content: String(change.content || ''),
    rationale: normalizeValue(change.rationale)
  }));
}

async function writeChanges(changes) {
  for (const change of changes) {
    const absolutePath = path.resolve(process.cwd(), change.path);
    await fs.writeFile(absolutePath, change.content, 'utf8');
  }
}

function collectChangedFiles() {
  return run('git', ['status', '--short'])
    .split('\n')
    .map((line) => line.replace(/^\s*[A-Z?]{1,2}\s+/, ''))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(Boolean);
}

function runVerification(changedFiles) {
  const commands = [];

  if (changedFiles.some((item) => item.startsWith('apps/api/'))) {
    commands.push({
      label: 'api-lint',
      command: 'npm',
      args: ['--prefix', 'apps/api', 'run', 'lint']
    });
  }

  if (changedFiles.some((item) => item.startsWith('apps/mobile/'))) {
    commands.push({
      label: 'mobile-lint',
      command: 'pnpm',
      args: ['--dir', 'apps/mobile', 'lint']
    });
    commands.push({
      label: 'mobile-types',
      command: 'npx',
      args: ['tsc', '-p', 'apps/mobile/tsconfig.json', '--noEmit']
    });
  }

  const results = [];
  for (const item of commands) {
    run(item.command, item.args);
    results.push(item.label);
  }

  return results;
}

function gitCommitAndPush(branchName, commitMessage) {
  const changedFiles = collectChangedFiles();
  if (!changedFiles.length) {
    return {
      changedFiles: [],
      commitSha: '',
      pushed: false
    };
  }

  run('git', ['config', 'user.name', '4TEEN Ops Runner']);
  run('git', ['config', 'user.email', 'ops-runner@4teen.me']);
  run('git', ['add', '--all']);
  run('git', ['commit', '-m', commitMessage]);
  const commitSha = run('git', ['rev-parse', 'HEAD']);
  run('git', ['push', '-u', 'origin', branchName]);

  return {
    changedFiles,
    commitSha,
    pushed: true
  };
}

function collectFilesMatchingDiff(baseRef, branchName, pathspecs = []) {
  const args = ['diff', '--name-only', `${baseRef}...${branchName}`];
  if (pathspecs.length) {
    args.push('--', ...pathspecs);
  }

  return run('git', args)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function createWalletDeployTree() {
  const apiDir = path.resolve(process.cwd(), 'apps/api');
  const deployDir = await fs.mkdtemp(path.join(os.tmpdir(), '4teen-wallet-heroku-'));
  await fs.cp(apiDir, deployDir, {
    recursive: true
  });
  await fs.writeFile(path.join(deployDir, 'Procfile'), 'web: npm start\nclock: node clock.js\n', 'utf8');
  return deployDir;
}

async function pushDeployTreeToHeroku(deployDir, options = {}) {
  const appName = normalizeValue(options?.appName);
  const apiKey = normalizeValue(options?.apiKey);
  const gitUrl = normalizeValue(options?.gitUrl) || `https://git.heroku.com/${appName}.git`;
  if (!appName || !apiKey) {
    throw new Error('Missing Heroku deploy credentials');
  }

  run('git', ['init', '-b', 'main'], { cwd: deployDir });
  run('git', ['config', 'user.name', '4TEEN Ops Runner'], { cwd: deployDir });
  run('git', ['config', 'user.email', 'ops-runner@4teen.me'], { cwd: deployDir });
  const askpassPath = path.join(deployDir, '.git', 'ops-heroku-askpass.sh');
  await fs.writeFile(
    askpassPath,
    '#!/bin/sh\ncase "$1" in\n  *Username*) echo "heroku" ;;\n  *Password*) echo "$HEROKU_API_KEY" ;;\n  *) echo "" ;;\nesac\n',
    'utf8'
  );
  await fs.chmod(askpassPath, 0o700);
  run('git', ['add', '--all'], { cwd: deployDir });
  run('git', ['commit', '-m', `ops: deploy ${appName}`], { cwd: deployDir });
  run('git', ['push', '--force', gitUrl, 'HEAD:main'], {
    cwd: deployDir,
    env: {
      HEROKU_API_KEY: apiKey,
      GIT_ASKPASS: askpassPath,
      GIT_TERMINAL_PROMPT: '0'
    }
  });
}

async function restartHerokuApp(config) {
  const heroku = config?.heroku || {};
  const appName = normalizeValue(heroku.appName);
  const apiKey = normalizeValue(heroku.apiKey);
  const email = normalizeValue(heroku.email);
  if (!appName || !apiKey || !email) {
    throw new Error('Missing Heroku restart credentials');
  }

  const response = await fetch(`https://api.heroku.com/apps/${encodeURIComponent(appName)}/dynos`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.heroku+json; version=3',
      Authorization: `Bearer ${apiKey}`,
      'Heroku-Account-Email': email,
      'User-Agent': '4teen-ops-runner'
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Heroku restart failed with status ${response.status}`);
  }

  return appName;
}

async function findOrCreateDraftPr(branchName, taskId, taskTitle) {
  const token = getEnv('GITHUB_TOKEN', { required: true });
  const repository = getEnv('GITHUB_REPOSITORY', { required: true });
  const [owner, repo] = repository.split('/');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': '4teen-ops-runner'
  };

  const search = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&base=${encodeURIComponent(DEFAULT_BRANCH)}`,
    { headers }
  );
  const existing = await readJson(search);
  if (Array.isArray(existing) && existing[0]?.html_url) {
    return {
      created: false,
      url: existing[0].html_url
    };
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `[Ops] Task #${taskId}: ${taskTitle}`,
      head: branchName,
      base: DEFAULT_BRANCH,
      draft: true,
      body:
        'Created by the 4TEEN Ops remote runner from a confirmed Telegram execution request.\n\nPlease review the branch diff and verification output before merging.'
    })
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub PR creation failed with status ${response.status}`);
  }

  return {
    created: true,
    url: payload?.html_url || ''
  };
}

async function processApply(request) {
  const workOrder = await fetchRequestWorkOrder(request.id);
  if (!workOrder?.readyToImplement) {
    return {
      status: 'blocked',
      summary: 'Task is not ready to implement',
      resultMessage: 'Work order is not marked as readyToImplement yet.'
    };
  }

  const fileSnapshots = await loadCandidateFiles(workOrder);
  if (!fileSnapshots.length) {
    return {
      status: 'blocked',
      summary: 'No repo files available for grounded changes',
      resultMessage: 'The work order did not expose any existing files that can be edited safely.'
    };
  }

  const branchName = `codex/ops-task-${Number(request.task_id || 0)}`;
  ensureTaskBranch(branchName);

  const plan = await requestServerApplyPlan(request.id, fileSnapshots);
  if (normalizeValue(plan?.outcome) !== 'apply') {
    return {
      status: 'blocked',
      summary: normalizeValue(plan?.summary) || 'Runner blocked by server-side Codex plan',
      resultMessage: normalizeValue(plan?.blockedReason) || 'Control plane refused to generate a safe grounded patch.'
    };
  }

  const changes = validateChanges(plan, fileSnapshots.map((item) => item.path));
  if (!changes.length) {
    return {
      status: 'done',
      summary: normalizeValue(plan?.summary) || 'No code changes were required',
      resultMessage: 'Codex concluded that no file changes were needed for this task.'
    };
  }

  await writeChanges(changes);
  const changedFiles = collectChangedFiles();
  const verification = runVerification(changedFiles);
  const gitResult = gitCommitAndPush(branchName, normalizeValue(plan?.commitMessage) || `ops: apply task #${request.task_id}`);

  return {
    status: 'done',
    summary: normalizeValue(plan?.summary) || `Applied task #${request.task_id}`,
    resultMessage: [
      `Branch: ${branchName}`,
      gitResult.commitSha ? `Commit: ${gitResult.commitSha}` : '',
      gitResult.pushed ? 'Branch was pushed to origin.' : '',
      verification.length ? `Verification: ${verification.join(', ')}` : '',
      changedFiles.length ? `Files: ${changedFiles.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    details: {
      branchName,
      commitSha: gitResult.commitSha,
      changedFiles,
      verification
    }
  };
}

async function processPublish(request) {
  const branchName = `codex/ops-task-${Number(request.task_id || 0)}`;
  if (!remoteBranchExists(branchName)) {
    return {
      status: 'blocked',
      summary: 'Branch is not available for publish step',
      resultMessage: `Remote branch ${branchName} does not exist yet. Run apply first.`
    };
  }

  const workOrder = await fetchRequestWorkOrder(request.id);
  const pr = await findOrCreateDraftPr(branchName, request.task_id, workOrder?.title || `Task ${request.task_id}`);
  return {
    status: 'done',
    summary: pr.created ? 'Opened draft PR for the prepared branch' : 'Draft PR already exists',
    resultMessage: pr.url || `Branch ${branchName} is available on origin.`,
    details: {
      branchName,
      pullRequestUrl: pr.url || null
    }
  };
}

async function processDeploy(request) {
  const config = await fetchRunnerConfig(request.id);
  if (!config?.heroku?.configured) {
    return {
      status: 'blocked',
      summary: 'Heroku deploy credentials are not configured',
      resultMessage: 'Control plane did not provide a usable Heroku deploy config for wallet-app.'
    };
  }

  const branchName = `codex/ops-task-${Number(request.task_id || 0)}`;
  if (!remoteBranchExists(branchName)) {
    return {
      status: 'blocked',
      summary: 'Branch is not available for deploy step',
      resultMessage: `Remote branch ${branchName} does not exist yet. Run apply first.`
    };
  }

  ensureTaskBranch(branchName);
  const backendChanges = collectFilesMatchingDiff(`origin/${DEFAULT_BRANCH}`, branchName, ['apps/api']);
  if (!backendChanges.length) {
    return {
      status: 'blocked',
      summary: 'No backend changes to deploy',
      resultMessage:
        'This branch does not change apps/api, so there is nothing meaningful to send to Heroku. GitHub changes are saved, but Heroku deploy is skipped.'
    };
  }

  const deployDir = await createWalletDeployTree();
  await pushDeployTreeToHeroku(deployDir, config.heroku);

  return {
    status: 'done',
    summary: 'Wallet backend deploy completed',
    resultMessage: [
      `Heroku app: ${normalizeValue(config?.heroku?.appName)}`,
      `Branch: ${branchName}`,
      `Backend files: ${backendChanges.join(', ')}`
    ].join('\n'),
    details: {
      branchName,
      backendChanges,
      herokuApp: normalizeValue(config?.heroku?.appName)
    }
  };
}

async function processRestart(request) {
  const config = await fetchRunnerConfig(request.id);
  if (!config?.heroku?.configured) {
    return {
      status: 'blocked',
      summary: 'Heroku restart credentials are not configured',
      resultMessage: 'Control plane did not provide a usable Heroku restart config for wallet-app.'
    };
  }

  const appName = await restartHerokuApp(config);
  return {
    status: 'done',
    summary: 'Wallet dynos restarted',
    resultMessage: `Restart requested for Heroku app ${appName}.`,
    details: {
      herokuApp: appName
    }
  };
}

async function main() {
  const request = await claimNextRequest();
  if (!request?.id) {
    log('idle', { repoKey: REPO_KEY });
    return;
  }

  log('claimed', {
    requestId: request.id,
    taskId: request.task_id,
    actionType: request.action_type
  });

  try {
    let result;
    if (request.action_type === 'apply') {
      result = await processApply(request);
    } else if (request.action_type === 'publish') {
      result = await processPublish(request);
    } else if (request.action_type === 'deploy') {
      result = await processDeploy(request);
    } else if (request.action_type === 'restart') {
      result = await processRestart(request);
    } else {
      result = {
        status: 'blocked',
        summary: 'Unknown action type',
        resultMessage: `Unsupported action type: ${request.action_type}`
      };
    }

    await finishRequest(request.id, result.status, result.summary, result.resultMessage, result.details || null);
    log('finished', {
      requestId: request.id,
      status: result.status,
      summary: result.summary
    });
  } catch (error) {
    const message = normalizeValue(error?.message) || 'Unknown runner failure';
    await finishRequest(request.id, 'blocked', 'Runner failed while processing request', message, {
      error: message
    }).catch(() => null);
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${normalizeValue(error?.message) || error}\n`);
  process.exit(1);
});
