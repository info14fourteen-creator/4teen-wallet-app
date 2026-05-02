const { fetch } = require('undici');
const env = require('../../config/env');
// Smoke test comment for runner v103

function normalizeValue(value) {
  return String(value || '').trim();
}

function hasRemoteDispatchConfig() {
  return Boolean(
    normalizeValue(env.GITHUB_REMOTE_TOKEN) &&
      normalizeValue(env.GITHUB_REMOTE_OWNER) &&
      normalizeValue(env.GITHUB_WALLET_REPO) &&
      normalizeValue(env.GITHUB_WEBSITE_REPO)
  );
}

function resolveRepoName(repoKey) {
  const safe = normalizeValue(repoKey).toLowerCase();
  if (safe === 'website') {
    return normalizeValue(env.GITHUB_WEBSITE_REPO);
  }

  if (safe === 'wallet-app') {
    return normalizeValue(env.GITHUB_WALLET_REPO);
  }

  return '';
}

async function dispatchExecutionRequest(request, task = null) {
  if (!hasRemoteDispatchConfig()) {
    return {
      ok: false,
      skipped: true,
      reason: 'github_remote_dispatch_not_configured'
    };
  }

  const repoName = resolveRepoName(request?.repo_key);
  if (!repoName) {
    return {
      ok: false,
      skipped: true,
      reason: 'unknown_repo_key'
    };
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(normalizeValue(env.GITHUB_REMOTE_OWNER))}/${encodeURIComponent(repoName)}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizeValue(env.GITHUB_REMOTE_TOKEN)}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': '4teen-ops-bot'
      },
      body: JSON.stringify({
        event_type: 'ops-execution-request',
        client_payload: {
          requestId: Number(request?.id || 0) || null,
          taskId: Number(request?.task_id || 0) || null,
          repoKey: normalizeValue(request?.repo_key),
          actionType: normalizeValue(request?.action_type) || 'apply',
          taskTitle: normalizeValue(task?.title) || null,
          opsBaseUrl:
            normalizeValue(env.ADMIN_TELEGRAM_WEBHOOK_BASE_URL) ||
            'https://fourteen-wallet-api-7af291023d36.herokuapp.com'
        }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`GitHub dispatch failed with status ${response.status}${text ? `: ${text}` : ''}`);
    error.status = response.status || 500;
    throw error;
  }

  return {
    ok: true,
    repoName,
    requestId: Number(request?.id || 0) || null
  };
}

module.exports = {
  dispatchExecutionRequest,
  hasRemoteDispatchConfig,
  resolveRepoName
};