import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OPS_EXPORT_BASE_URL = normalizeValue(process.env.OPS_EXPORT_BASE_URL);
const ADMIN_SYNC_TOKEN = normalizeValue(process.env.ADMIN_SYNC_TOKEN);
const OPENAI_API_KEY = normalizeValue(process.env.OPENAI_API_KEY);
const OPENAI_ORG_ID = normalizeValue(process.env.OPENAI_ORG_ID);
const OPENAI_PROJECT_ID = normalizeValue(process.env.OPENAI_PROJECT_ID);
const OPENAI_CODEX_MODEL = normalizeValue(process.env.OPENAI_CODEX_MODEL) || 'gpt-5-codex';
const HEROKU_API_KEY = normalizeValue(process.env.HEROKU_API_KEY);
const HEROKU_EMAIL = normalizeValue(process.env.HEROKU_EMAIL);
const HEROKU_APP_NAME = normalizeValue(process.env.HEROKU_APP_NAME) || 'fourteen-wallet-api';
const OPS_REPO_KEY = normalizeValue(process.env.OPS_REPO_KEY) || 'wallet-app';
const REQUEST_ID = Number(process.env.OPS_REQUEST_ID || 0);
const TASK_ID = Number(process.env.OPS_TASK_ID || 0);
const ACTION_TYPE = normalizeValue(process.env.OPS_ACTION_TYPE) || 'apply';
const DEFAULT_BRANCH = normalizeValue(process.env.GITHUB_REF_NAME) || 'main';
const RUNNER_ID = `github-actions/${process.env.GITHUB_REPOSITORY || OPS_REPO_KEY}/${process.env.GITHUB_RUN_ID || 'manual'}`;

function normalizeValue(value) {
  return String(value || '').trim();
}

function assertEnv(name, value) {
  if (!normalizeValue(value)) {
    throw new Error(`Missing required env: ${name}`);
  }
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

async function api(pathname, options = {}) {
  assertEnv('OPS_EXPORT_BASE_URL', OPS_EXPORT_BASE_URL);
  assertEnv('ADMIN_SYNC_TOKEN', ADMIN_SYNC_TOKEN);

  const response = await fetch(`${OPS_EXPORT_BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${ADMIN_SYNC_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Ops API request failed: ${response.status}`);
  }

  return payload;
}

async function claimRequest() {
  const payload = await api('/ops/execution-requests/claim', {
    method: 'POST',
    body: {
      requestId: REQUEST_ID || null,
      repoKey: OPS_REPO_KEY,
      actionType: ACTION_TYPE,
      runnerId: RUNNER_ID
    }
  });

  return payload.result || null;
}

async function finishRequest(requestId, status, summary, resultMessage, details = {}) {
  await api(`/ops/execution-requests/${requestId}/finish`, {
    method: 'POST',
    body: {
      status,
      runnerId: RUNNER_ID,
      summary,
      resultMessage,
      details
    }
  });
}

async function loadWorkOrder(taskId) {
  const payload = await api(`/ops/tasks/${taskId}/work-order`);
  return payload.item || null;
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
  const proposed = Array.isArray(workOrder?.proposedFiles) ? workOrder.proposedFiles : [];
  const findings = Array.isArray(workOrder?.repoFindings) ? workOrder.repoFindings : [];

  for (const value of proposed) {
    const safe = normalizeValue(value);
    if (safe && !seen.has(safe)) {
      seen.add(safe);
      items.push(safe);
    }
  }

  for (const finding of findings) {
    const safe = normalizeValue(finding?.file || finding);
    if (safe && !seen.has(safe)) {
      seen.add(safe);
      items.push(safe);
    }
  }

  return items.slice(0, 8);
}

function buildPrompt(workOrder, contextFiles) {
  const lines = [
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
  ];

  return lines.join('\n');
}

function buildOpenAiHeaders() {
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };

  if (OPENAI_ORG_ID) {
    headers['OpenAI-Organization'] = OPENAI_ORG_ID;
  }

  if (OPENAI_PROJECT_ID) {
    headers['OpenAI-Project'] = OPENAI_PROJECT_ID;
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
  const direct = normalizeValue(text);
  if (!direct) {
    return null;
  }

  try {
    return JSON.parse(direct);
  } catch (_) {
    const start = direct.indexOf('{');
    const end = direct.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1));
    }
  }

  return null;
}

async function generateImplementation(workOrder, contextFiles) {
  assertEnv('OPENAI_API_KEY', OPENAI_API_KEY);

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: buildOpenAiHeaders(),
    body: JSON.stringify({
      model: OPENAI_CODEX_MODEL,
      reasoning: {
        effort: 'medium'
      },
      input: buildPrompt(workOrder, contextFiles)
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}`);
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

function checkoutBranch(taskId) {
  const branch = `codex/ops-task-${taskId}`;
  run('git', ['checkout', '-B', branch]);
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

function commitAndPush(taskId) {
  const branch = `codex/ops-task-${taskId}`;
  run('git', ['add', '-A']);
  const hasChanges = run('git', ['diff', '--cached', '--name-only']).trim();
  if (!hasChanges) {
    throw new Error('No staged changes to commit');
  }

  run('git', ['commit', '-m', `feat: implement ops task #${taskId}`], {
    stdio: 'inherit'
  });

  run('git', ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${branch}`], {
    stdio: 'inherit'
  });

  const commitSha = run('git', ['rev-parse', 'HEAD']).trim();
  return {
    branch,
    commitSha
  };
}

function remoteBranchExists(taskId) {
  const branch = `codex/ops-task-${taskId}`;
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

function deployToHeroku(branch) {
  assertEnv('HEROKU_API_KEY', HEROKU_API_KEY);
  assertEnv('HEROKU_EMAIL', HEROKU_EMAIL);
  assertEnv('HEROKU_APP_NAME', HEROKU_APP_NAME);

  const remoteUrl = `https://heroku:${HEROKU_API_KEY}@git.heroku.com/${HEROKU_APP_NAME}.git`;
  run('git', ['push', '--force', remoteUrl, `${branch}:main`], {
    stdio: 'inherit',
    env: {
      GIT_TERMINAL_PROMPT: '0'
    }
  });
}

async function restartHeroku() {
  assertEnv('HEROKU_API_KEY', HEROKU_API_KEY);
  assertEnv('HEROKU_APP_NAME', HEROKU_APP_NAME);

  const response = await fetch(`https://api.heroku.com/apps/${encodeURIComponent(HEROKU_APP_NAME)}/dynos`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.heroku+json; version=3',
      Authorization: `Bearer ${HEROKU_API_KEY}`
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Heroku restart failed with status ${response.status}${text ? `: ${text}` : ''}`);
  }
}

async function handleApply(request) {
  const workOrder = await loadWorkOrder(TASK_ID || request.task_id);
  if (!workOrder?.readyToImplement) {
    throw new Error('Task does not have a ready work order yet');
  }

  ensureGitIdentity();
  checkoutBranch(workOrder.taskId);

  const repoPaths = uniquePaths(workOrder);
  const contextFiles = [];
  for (const repoPath of repoPaths) {
    const item = await readFileIfPresent(repoPath);
    if (item) {
      contextFiles.push(item);
    }
  }

  const implementation = await generateImplementation(workOrder, contextFiles);
  if (implementation.blocked) {
    throw new Error(normalizeValue(implementation.reason) || 'Model reported blocked');
  }

  await writeChanges(Array.isArray(implementation.files) ? implementation.files : []);
  const files = changedFiles();
  if (!files.length) {
    throw new Error('Model did not produce a working diff');
  }

  const checks = verifyWalletChanges(files);
  const pushed = commitAndPush(workOrder.taskId);

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

async function handlePublish(request) {
  const taskId = TASK_ID || request.task_id;
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

async function handleDeploy(request) {
  const taskId = TASK_ID || request.task_id;
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

  deployToHeroku(remote.branch);
  return {
    summary: `Deployed ${remote.branch} to ${HEROKU_APP_NAME}`,
    resultMessage: `Heroku app ${HEROKU_APP_NAME} was updated from ${remote.branch}.`,
    details: {
      branch: remote.branch,
      herokuApp: HEROKU_APP_NAME,
      changedFiles: files
    }
  };
}

async function handleRestart(request) {
  const taskId = TASK_ID || request.task_id;
  await restartHeroku();
  return {
    summary: `Restarted ${HEROKU_APP_NAME} for task #${taskId}`,
    resultMessage: `Heroku dynos for ${HEROKU_APP_NAME} were restarted.`,
    details: {
      herokuApp: HEROKU_APP_NAME
    }
  };
}

async function main() {
  if (!Number.isFinite(REQUEST_ID) || REQUEST_ID <= 0) {
    throw new Error('Missing or invalid OPS_REQUEST_ID');
  }
  assertEnv('OPS_ACTION_TYPE', ACTION_TYPE);

  let claimed = null;
  try {
    claimed = await claimRequest();
    if (!claimed) {
      console.log('No confirmed request was claimed. Exiting quietly.');
      return;
    }

    if (Number(claimed.id || 0) !== REQUEST_ID) {
      throw new Error(`Claimed request #${claimed.id} but expected #${REQUEST_ID}`);
    }

    let outcome;
    if (ACTION_TYPE === 'apply') {
      outcome = await handleApply(claimed);
    } else if (ACTION_TYPE === 'publish') {
      outcome = await handlePublish(claimed);
    } else if (ACTION_TYPE === 'deploy') {
      outcome = await handleDeploy(claimed);
    } else if (ACTION_TYPE === 'restart') {
      outcome = await handleRestart(claimed);
    } else {
      throw new Error(`Unsupported action type: ${ACTION_TYPE}`);
    }

    await finishRequest(claimed.id, 'done', outcome.summary, outcome.resultMessage, outcome.details);
  } catch (error) {
    console.error(error);
    if (claimed?.id) {
      await finishRequest(
        claimed.id,
        'blocked',
        `Remote runner blocked ${ACTION_TYPE} for task #${TASK_ID || claimed.task_id}`,
        normalizeValue(error?.message) || 'Unknown runner failure',
        {
          actionType: ACTION_TYPE,
          repoKey: OPS_REPO_KEY
        }
      ).catch(() => null);
    }

    process.exitCode = 1;
  }
}

await main();
