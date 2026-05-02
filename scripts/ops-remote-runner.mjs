import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OPS_REPO_KEY = normalizeValue(process.env.OPS_REPO_KEY) || 'wallet-app';
const REQUEST_ID = Number(process.env.OPS_REQUEST_ID || 0);
const TASK_ID = Number(process.env.OPS_TASK_ID || 0);
const ACTION_TYPE = normalizeValue(process.env.OPS_ACTION_TYPE) || 'apply';
const OPS_BASE_URL = normalizeValue(process.env.OPS_BASE_URL).replace(/\/+$/, '');
const OPS_RUNNER_TOKEN = normalizeValue(process.env.OPS_RUNNER_TOKEN);
const DEFAULT_BRANCH = normalizeValue(process.env.GITHUB_REF_NAME) || 'main';
const RUNNER_ID = `github-actions/${process.env.GITHUB_REPOSITORY || OPS_REPO_KEY}/${process.env.GITHUB_RUN_ID || 'manual'}`;

function normalizeValue(value) {
  return String(value || '').trim();
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`$ ${printable}`);
  return execFileSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

async function remoteApi(pathname, body = {}) {
  const response = await fetch(`${OPS_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Remote runner API failed: ${response.status}`);
  }

  return payload.result || null;
}

async function bootstrap() {
  return remoteApi(`/ops/execution-requests/${REQUEST_ID}/bootstrap`, {
    token: OPS_RUNNER_TOKEN,
    runnerId: RUNNER_ID
  });
}

async function finish(status, summary, resultMessage, details = {}) {
  return remoteApi(`/ops/execution-requests/${REQUEST_ID}/finish-remote`, {
    token: OPS_RUNNER_TOKEN,
    runnerId: RUNNER_ID,
    status,
    summary,
    resultMessage,
    details
  });
}

async function readFileIfPresent(relativePath, limit = 24_000) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  try {
    const content = await fs.readFile(absolutePath, 'utf8');
    return {
      path: relativePath,
      content: content.length > limit ? `${content.slice(0, limit)}\n/* truncated */` : content
    };
  } catch (_) {
    return null;
  }
}

function uniquePaths(workOrder) {
  const seen = new Set();
  const items = [];

  for (const value of Array.isArray(workOrder?.proposedFiles) ? workOrder.proposedFiles : []) {
    const safe = normalizeValue(value);
    if (safe && !seen.has(safe)) {
      seen.add(safe);
      items.push(safe);
    }
  }

  for (const finding of Array.isArray(workOrder?.repoFindings) ? workOrder.repoFindings : []) {
    const safe = normalizeValue(finding?.file || finding);
    if (safe && !seen.has(safe)) {
      seen.add(safe);
      items.push(safe);
    }
  }

  return items.slice(0, 8);
}

function buildPrompt(workOrder, contextFiles) {
  return [
    'You are implementing a real code task inside the 4TEEN wallet repository.',
    'Return strict JSON only. No markdown fences, no commentary.',
    'Schema:',
    '{"blocked":boolean,"reason":string|null,"summary":string,"commitMessage":string,"files":[{"path":string,"content":string}],"testsRun":[string]}',
    'Rules:',
    '- Use only the provided work order and file context.',
    '- Do not invent file paths.',
    '- Only change files that are clearly relevant to the task.',
    '- Prefer minimal, production-ready changes.',
    '- If the request is not implementable from the provided evidence, set blocked=true and explain why.',
    '',
    'Work order:',
    JSON.stringify(workOrder, null, 2),
    '',
    'Repository context:',
    JSON.stringify(contextFiles, null, 2)
  ].join('\n');
}

function buildOpenAiHeaders(credentials) {
  const headers = {
    Authorization: `Bearer ${normalizeValue(credentials?.openaiApiKey)}`,
    'Content-Type': 'application/json'
  };

  if (normalizeValue(credentials?.openaiOrgId)) {
    headers['OpenAI-Organization'] = normalizeValue(credentials.openaiOrgId);
  }

  if (normalizeValue(credentials?.openaiProjectId)) {
    headers['OpenAI-Project'] = normalizeValue(credentials.openaiProjectId);
  }

  return headers;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = normalizeValue(part?.text || part?.output_text);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function extractJson(text) {
  const safe = normalizeValue(text);
  if (!safe) {
    return null;
  }

  try {
    return JSON.parse(safe);
  } catch (_) {
    const start = safe.indexOf('{');
    const end = safe.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(safe.slice(start, end + 1));
    }
  }

  return null;
}

async function generateImplementation(workOrder, contextFiles, credentials) {
  if (!normalizeValue(credentials?.openaiApiKey)) {
    throw new Error('Remote runner did not receive OpenAI credentials');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: buildOpenAiHeaders(credentials),
    body: JSON.stringify({
      model: normalizeValue(credentials?.openaiCodexModel) || 'gpt-5-codex',
      reasoning: {
        effort: 'medium'
      },
      input: buildPrompt(workOrder, contextFiles)
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed: ${response.status}`);
  }

  const parsed = extractJson(extractResponseText(payload));
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error('Model did not return a valid implementation payload');
  }

  return parsed;
}

async function writeChanges(files) {
  for (const file of files) {
    const relativePath = normalizeValue(file?.path);
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) {
      throw new Error(`Unsafe file path from model: ${relativePath || '<empty>'}`);
    }

    const absolutePath = path.resolve(process.cwd(), relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, String(file?.content ?? ''), 'utf8');
  }
}

function changedFiles() {
  const output = run('git', ['diff', '--name-only']);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureGitIdentity() {
  run('git', ['config', 'user.name', '4TEEN Ops Runner']);
  run('git', ['config', 'user.email', 'ops-runner@4teen.me']);
}

function branchName(taskId) {
  return `codex/ops-task-${taskId}`;
}

function checkoutBranch(taskId) {
  const branch = branchName(taskId);
  run('git', ['checkout', '-B', branch], { stdio: 'inherit' });
  return branch;
}

function verifyWalletChanges(files) {
  const commands = [];
  if (files.some((file) => file.startsWith('apps/api/'))) {
    commands.push({
      label: 'npm --prefix apps/api run lint',
      command: 'npm',
      args: ['--prefix', 'apps/api', 'run', 'lint']
    });
  }

  if (files.some((file) => file.startsWith('apps/mobile/'))) {
    commands.push({
      label: 'pnpm --dir apps/mobile exec tsc --noEmit',
      command: 'pnpm',
      args: ['--dir', 'apps/mobile', 'exec', 'tsc', '--noEmit']
    });
  }

  const results = [];
  for (const item of commands) {
    run(item.command, item.args, { stdio: 'inherit' });
    results.push(item.label);
  }

  return results;
}

function commitAndPush(taskId, commitMessage) {
  const branch = branchName(taskId);
  run('git', ['add', '-A']);
  const staged = run('git', ['diff', '--cached', '--name-only']).trim();
  if (!staged) {
    throw new Error('No staged changes to commit');
  }

  run('git', ['commit', '-m', normalizeValue(commitMessage) || `feat: implement ops task #${taskId}`], {
    stdio: 'inherit'
  });

  run('git', ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${branch}`], {
    stdio: 'inherit'
  });

  return {
    branch,
    commitSha: run('git', ['rev-parse', 'HEAD']).trim()
  };
}

function remoteBranchExists(taskId) {
  const branch = branchName(taskId);
  const output = run('git', ['ls-remote', '--heads', 'origin', branch]).trim();
  return {
    branch,
    exists: Boolean(output)
  };
}

function checkoutRemoteBranch(branch) {
  run('git', ['fetch', 'origin', branch], { stdio: 'inherit' });
  run('git', ['checkout', '-B', branch, `origin/${branch}`], { stdio: 'inherit' });
}

function inferDeployability(files) {
  const backendTouched = files.some((file) => file.startsWith('apps/api/') || file === 'Procfile');
  const mobileTouched = files.some((file) => file.startsWith('apps/mobile/'));

  if (backendTouched) {
    return {
      deployable: true,
      reason: 'backend'
    };
  }

  if (mobileTouched) {
    return {
      deployable: false,
      reason: 'mobile_release_requires_store_pipeline'
    };
  }

  return {
    deployable: false,
    reason: 'no_server_side_changes_detected'
  };
}

function deployToHeroku(branch, credentials) {
  const apiKey = normalizeValue(credentials?.herokuApiKey);
  const email = normalizeValue(credentials?.herokuEmail);
  const appName = normalizeValue(credentials?.herokuAppName) || 'fourteen-wallet-api';

  if (!apiKey || !email) {
    throw new Error('Remote runner did not receive Heroku deployment credentials');
  }

  const remoteUrl = `https://heroku:${apiKey}@git.heroku.com/${appName}.git`;
  run('git', ['push', '--force', remoteUrl, `${branch}:main`], {
    stdio: 'inherit',
    env: {
      GIT_TERMINAL_PROMPT: '0',
      HEROKU_API_KEY: apiKey,
      HEROKU_EMAIL: email
    }
  });

  return appName;
}

async function restartHeroku(credentials) {
  const apiKey = normalizeValue(credentials?.herokuApiKey);
  const appName = normalizeValue(credentials?.herokuAppName) || 'fourteen-wallet-api';

  if (!apiKey) {
    throw new Error('Remote runner did not receive Heroku restart credentials');
  }

  const response = await fetch(`https://api.heroku.com/apps/${encodeURIComponent(appName)}/dynos`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.heroku+json; version=3',
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Heroku restart failed with status ${response.status}${text ? `: ${text}` : ''}`);
  }

  return appName;
}

async function handleApply(bootstrapResult) {
  const workOrder = bootstrapResult?.workOrder;
  if (!workOrder?.readyToImplement) {
    throw new Error('Task does not have a ready work order yet');
  }

  ensureGitIdentity();
  checkoutBranch(workOrder.taskId);

  const contextFiles = [];
  for (const repoPath of uniquePaths(workOrder)) {
    const item = await readFileIfPresent(repoPath);
    if (item) {
      contextFiles.push(item);
    }
  }

  const implementation = await generateImplementation(workOrder, contextFiles, bootstrapResult?.credentials || {});
  if (implementation.blocked) {
    throw new Error(normalizeValue(implementation.reason) || 'Model reported blocked');
  }

  await writeChanges(Array.isArray(implementation.files) ? implementation.files : []);
  const files = changedFiles();
  if (!files.length) {
    throw new Error('Model did not produce a working diff');
  }

  const checks = verifyWalletChanges(files);
  const pushed = commitAndPush(workOrder.taskId, implementation.commitMessage);

  return {
    summary: normalizeValue(implementation.summary) || `Implemented task #${workOrder.taskId}`,
    resultMessage: [
      `Branch: ${pushed.branch}`,
      `Commit: ${pushed.commitSha}`,
      `Files: ${files.join(', ')}`,
      checks.length ? `Checks: ${checks.join(' | ')}` : 'Checks: none'
    ].join('\n'),
    details: {
      branch: pushed.branch,
      commitSha: pushed.commitSha,
      changedFiles: files,
      checks
    }
  };
}

async function handlePublish(bootstrapResult) {
  const taskId = TASK_ID || bootstrapResult?.request?.task_id;
  const remote = remoteBranchExists(taskId);
  if (!remote.exists) {
    throw new Error(`Branch ${remote.branch} is not on origin yet. Run apply first.`);
  }

  return {
    summary: `Branch ${remote.branch} is already published`,
    resultMessage: `Remote branch ${remote.branch} is available on origin.`,
    details: {
      branch: remote.branch,
      alreadyPublished: true
    }
  };
}

async function handleDeploy(bootstrapResult) {
  const taskId = TASK_ID || bootstrapResult?.request?.task_id;
  const remote = remoteBranchExists(taskId);
  if (!remote.exists) {
    throw new Error(`Branch ${remote.branch} is not on origin yet. Apply the task first.`);
  }

  checkoutRemoteBranch(remote.branch);
  const files = run('git', ['diff', '--name-only', `origin/${DEFAULT_BRANCH}...HEAD`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const deployability = inferDeployability(files);
  if (!deployability.deployable) {
    throw new Error(`Deploy blocked: ${deployability.reason}`);
  }

  const appName = deployToHeroku(remote.branch, bootstrapResult?.credentials || {});
  return {
    summary: `Deployed ${remote.branch} to ${appName}`,
    resultMessage: `Heroku app ${appName} was updated from ${remote.branch}.`,
    details: {
      branch: remote.branch,
      herokuApp: appName,
      changedFiles: files
    }
  };
}

async function handleRestart(bootstrapResult) {
  const appName = await restartHeroku(bootstrapResult?.credentials || {});
  return {
    summary: `Restarted ${appName} for task #${TASK_ID || bootstrapResult?.request?.task_id || 0}`,
    resultMessage: `Heroku dynos for ${appName} were restarted.`,
    details: {
      herokuApp: appName
    }
  };
}

async function main() {
  if (!Number.isFinite(REQUEST_ID) || REQUEST_ID <= 0) {
    throw new Error('Missing or invalid OPS_REQUEST_ID');
  }

  if (!OPS_BASE_URL || !OPS_RUNNER_TOKEN) {
    throw new Error('Missing bootstrap payload for remote runner');
  }

  let bootstrapResult = null;
  try {
    bootstrapResult = await bootstrap();
    if (!bootstrapResult?.request) {
      throw new Error('Remote runner did not receive a claimed request');
    }

    let outcome;
    if (ACTION_TYPE === 'apply') {
      outcome = await handleApply(bootstrapResult);
    } else if (ACTION_TYPE === 'publish') {
      outcome = await handlePublish(bootstrapResult);
    } else if (ACTION_TYPE === 'deploy') {
      outcome = await handleDeploy(bootstrapResult);
    } else if (ACTION_TYPE === 'restart') {
      outcome = await handleRestart(bootstrapResult);
    } else {
      throw new Error(`Unsupported action type: ${ACTION_TYPE}`);
    }

    await finish('done', outcome.summary, outcome.resultMessage, outcome.details);
  } catch (error) {
    console.error(error);
    await finish(
      'blocked',
      `Remote runner blocked ${ACTION_TYPE} for task #${TASK_ID || bootstrapResult?.request?.task_id || REQUEST_ID}`,
      normalizeValue(error?.message) || 'Unknown runner failure',
      {
        actionType: ACTION_TYPE,
        repoKey: OPS_REPO_KEY
      }
    ).catch(() => null);
    process.exitCode = 1;
  }
}

await main();
