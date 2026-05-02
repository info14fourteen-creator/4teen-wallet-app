const { fetch } = require('undici');
const env = require('../../config/env');
const { claimExecutionRequest, finishExecutionRequest } = require('./executionRequests');
const { buildTaskWorkOrder, getTaskById } = require('./tasks');
const { generateApplyPlan, validateChanges } = require('./remoteApplyPlan');

const MAX_ALLOWED_FILES = 6;
const MAX_FILE_CHARS = 35_000;
const RUNNER_ID = 'heroku-ops-runner';

function normalizeValue(value) {
  return String(value || '').trim();
}

function log(step, payload = {}) {
  console.info('[ops-remote-runner]', step, payload);
}

function getGithubOwner() {
  return normalizeValue(env.GITHUB_REMOTE_OWNER) || 'info14fourteen-creator';
}

function getGithubRepo(repoKey) {
  return repoKey === 'website'
    ? normalizeValue(env.GITHUB_WEBSITE_REPO)
    : normalizeValue(env.GITHUB_WALLET_REPO);
}

function getGithubToken() {
  return normalizeValue(env.GITHUB_REMOTE_TOKEN);
}

function hasRunnerConfig() {
  return Boolean(getGithubToken() && getGithubRepo('wallet-app') && getGithubRepo('website'));
}

function buildBranchName(taskId) {
  return `codex/ops-task-${Number(taskId || 0)}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function githubHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${getGithubToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': '4teen-ops-runner',
    ...extra
  };
}

async function githubApi(repoKey, apiPath, options = {}) {
  const owner = getGithubOwner();
  const repo = getGithubRepo(repoKey);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${apiPath}`, {
    method: options.method || 'GET',
    headers: githubHeaders(options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub API failed with status ${response.status}`);
    error.status = response.status || 500;
    throw error;
  }
  return payload;
}

function decodeGithubContent(content) {
  return Buffer.from(String(content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

async function ensureGithubBranch(repoKey, branchName) {
  try {
    await githubApi(repoKey, `/git/ref/heads/${encodeURIComponent(branchName)}`);
    return;
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const baseRef = await githubApi(repoKey, '/git/ref/heads/main');
  await githubApi(repoKey, '/git/refs', {
    method: 'POST',
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseRef?.object?.sha
    }
  });
}

async function fetchGithubFile(repoKey, branchName, filePath) {
  return githubApi(
    repoKey,
    `/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branchName)}`
  );
}

async function loadCandidateFiles(repoKey, branchName, workOrder) {
  const candidates = Array.isArray(workOrder?.proposedFiles) ? workOrder.proposedFiles : [];
  const files = [];

  for (const relativePath of candidates) {
    if (files.length >= MAX_ALLOWED_FILES) break;
    const safePath = normalizeValue(relativePath).replace(/^\/+/, '');
    if (!safePath) continue;

    try {
      const file = await fetchGithubFile(repoKey, branchName, safePath);
      files.push({
        path: safePath,
        content: decodeGithubContent(file?.content || '').slice(0, MAX_FILE_CHARS)
      });
    } catch (_) {
      continue;
    }
  }

  return files;
}

async function updateGithubFile(repoKey, branchName, change, message) {
  const current = await fetchGithubFile(repoKey, branchName, change.path);
  return githubApi(repoKey, `/contents/${change.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    body: {
      message,
      branch: branchName,
      sha: normalizeValue(current?.sha),
      content: Buffer.from(change.content, 'utf8').toString('base64')
    }
  });
}

async function updateGithubFiles(repoKey, branchName, changes, commitMessage) {
  const results = [];
  for (const change of changes) {
    const result = await updateGithubFile(repoKey, branchName, change, commitMessage);
    results.push(result);
  }

  const last = results[results.length - 1];
  return {
    changedFiles: changes.map((item) => item.path),
    commitSha: normalizeValue(last?.commit?.sha)
  };
}

async function createOrFindDraftPr(repoKey, branchName, taskId, taskTitle) {
  const owner = getGithubOwner();
  const repo = getGithubRepo(repoKey);
  const search = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}&base=main`,
    { headers: githubHeaders() }
  );
  const existing = await readJson(search);
  if (Array.isArray(existing) && existing[0]?.html_url) {
    return existing[0].html_url;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({
      title: `[Ops] Task #${taskId}: ${taskTitle}`,
      head: branchName,
      base: 'main',
      draft: true,
      body:
        'Created by the 4TEEN Ops remote runner from a confirmed Telegram execution request.\n\nPlease review the branch diff before merging.'
    })
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub PR creation failed with status ${response.status}`);
  }

  return payload?.html_url || '';
}

async function restartWalletApp() {
  const apiKey = normalizeValue(env.OPS_REMOTE_HEROKU_API_KEY);
  const email = normalizeValue(env.OPS_REMOTE_HEROKU_EMAIL);
  const appName = normalizeValue(env.OPS_WALLET_HEROKU_APP_NAME);
  if (!apiKey || !email || !appName) {
    throw new Error('Heroku restart credentials are not configured');
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

async function processApply(request) {
  const task = await getTaskById(request.task_id);
  const workOrder = buildTaskWorkOrder(task);
  if (!workOrder?.readyToImplement) {
    return {
      status: 'blocked',
      summary: 'Task is not ready to implement',
      resultMessage: 'Work order is not marked as readyToImplement yet.'
    };
  }

  const branchName = buildBranchName(request.task_id);
  await ensureGithubBranch(request.repo_key, branchName);
  const fileSnapshots = await loadCandidateFiles(request.repo_key, branchName, workOrder);
  if (!fileSnapshots.length) {
    return {
      status: 'blocked',
      summary: 'No repo files available for grounded changes',
      resultMessage: 'The work order did not expose any existing files that can be edited safely.'
    };
  }

  const plan = await generateApplyPlan(request.repo_key, workOrder, fileSnapshots);
  if (normalizeValue(plan?.outcome) !== 'apply') {
    return {
      status: 'blocked',
      summary: normalizeValue(plan?.summary) || 'Runner blocked by Codex plan',
      resultMessage: normalizeValue(plan?.blockedReason) || 'Codex refused to generate a safe grounded patch.'
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

  const gitResult = await updateGithubFiles(
    request.repo_key,
    branchName,
    changes,
    normalizeValue(plan?.commitMessage) || `ops: apply task #${request.task_id}`
  );

  return {
    status: 'done',
    summary: normalizeValue(plan?.summary) || `Applied task #${request.task_id}`,
    resultMessage: [
      `Branch: ${branchName}`,
      gitResult.commitSha ? `Commit: ${gitResult.commitSha}` : '',
      gitResult.changedFiles.length ? `Files: ${gitResult.changedFiles.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  };
}

async function processPublish(request) {
  const branchName = buildBranchName(request.task_id);
  const task = await getTaskById(request.task_id);
  const url = await createOrFindDraftPr(
    request.repo_key,
    branchName,
    request.task_id,
    task?.title || `Task ${request.task_id}`
  );

  return {
    status: 'done',
    summary: 'Publish step completed',
    resultMessage: url || `Branch ${branchName} is available on origin.`
  };
}

async function processDeploy(request) {
  return {
    status: 'blocked',
    summary: 'Automatic deploy is not wired in the Heroku runner yet',
    resultMessage:
      request.repo_key === 'website'
        ? 'Website deploy still needs a build-and-release bridge from the prepared branch. For now the runner safely prepares the branch and draft PR.'
        : 'Wallet app production deploy still runs from a separate Heroku source tree, so auto-deploy stays blocked until that bridge is unified.'
  };
}

async function processRestart(request) {
  if (request.repo_key !== 'wallet-app') {
    return {
      status: 'blocked',
      summary: 'Website restart is not a supported action',
      resultMessage: 'Cloudflare Worker deploys do not have a separate restart step. Use deploy instead.'
    };
  }

  const appName = await restartWalletApp();
  return {
    status: 'done',
    summary: 'Requested Heroku dyno restart',
    resultMessage: `Restart requested for app ${appName}.`
  };
}

async function processOneRemoteExecutionRequest() {
  if (!hasRunnerConfig()) {
    return {
      ok: false,
      skipped: true,
      reason: 'runner_not_configured'
    };
  }

  for (const repoKey of ['wallet-app', 'website']) {
    for (const actionType of ['apply', 'publish', 'deploy', 'restart']) {
      const request = await claimExecutionRequest({
        repoKey,
        actionType,
        runnerId: RUNNER_ID
      }).catch(() => null);

      if (!request?.id) {
        continue;
      }

      log('claimed', {
        requestId: request.id,
        taskId: request.task_id,
        repoKey: request.repo_key,
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

        await finishExecutionRequest(request.id, {
          status: result.status,
          runnerId: RUNNER_ID,
          summary: result.summary,
          resultMessage: result.resultMessage
        });

        return {
          ok: true,
          requestId: request.id,
          status: result.status,
          summary: result.summary
        };
      } catch (error) {
        const message = normalizeValue(error?.message) || 'Unknown runner failure';
        await finishExecutionRequest(request.id, {
          status: 'blocked',
          runnerId: RUNNER_ID,
          summary: 'Runner failed while processing request',
          resultMessage: message
        }).catch(() => null);

        return {
          ok: false,
          requestId: request.id,
          status: 'blocked',
          error: message
        };
      }
    }
  }

  return {
    ok: true,
    idle: true
  };
}

module.exports = {
  processOneRemoteExecutionRequest
};
