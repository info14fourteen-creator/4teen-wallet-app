function normalizeValue(value) {
  return String(value || '').trim();
}

function getBaseUrl() {
  return normalizeValue(process.env.OPS_EXPORT_BASE_URL || 'https://fourteen-wallet-api-7af291023d36.herokuapp.com').replace(/\/+$/, '');
}

function getHeaders(extra = {}) {
  const adminToken = normalizeValue(process.env.ADMIN_SYNC_TOKEN);
  if (!adminToken) {
    throw new Error('Missing ADMIN_SYNC_TOKEN');
  }

  return {
    Authorization: `Bearer ${adminToken}`,
    ...extra
  };
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${getBaseUrl()}${path}`, options);
  const payload = await readJson(response);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function claim(repoKey, actionType = 'apply') {
  const payload = await requestJson('/ops/execution-requests/claim', {
    method: 'POST',
    headers: getHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({
      repoKey,
      actionType,
      runnerId: normalizeValue(process.env.OPS_EXECUTOR_RUNNER_ID || 'codex-desktop')
    })
  });

  process.stdout.write(`${JSON.stringify(payload?.result || null, null, 2)}\n`);
}

async function workOrder(taskId) {
  const payload = await requestJson(`/ops/tasks/${encodeURIComponent(taskId)}/work-order`, {
    headers: getHeaders()
  });

  process.stdout.write(`${JSON.stringify(payload?.item || null, null, 2)}\n`);
}

async function finish(requestId, status, summary, resultMessage) {
  const payload = await requestJson(`/ops/execution-requests/${encodeURIComponent(requestId)}/finish`, {
    method: 'POST',
    headers: getHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({
      status,
      summary,
      resultMessage,
      runnerId: normalizeValue(process.env.OPS_EXECUTOR_RUNNER_ID || 'codex-desktop')
    })
  });

  process.stdout.write(`${JSON.stringify(payload?.result || null, null, 2)}\n`);
}

async function list(repoKey, status, actionType = '') {
  const params = new URLSearchParams();
  if (repoKey) params.set('repoKey', repoKey);
  if (status) params.set('status', status);
  if (actionType) params.set('actionType', actionType);

  const payload = await requestJson(`/ops/execution-requests${params.toString() ? `?${params.toString()}` : ''}`, {
    headers: getHeaders()
  });

  process.stdout.write(`${JSON.stringify(payload?.items || [], null, 2)}\n`);
}

async function main() {
  const [command = '', ...rest] = process.argv.slice(2);

  if (command === 'claim') {
    const repoKey = normalizeValue(rest[0]);
    const actionType = normalizeValue(rest[1] || 'apply');
    if (!repoKey) {
      throw new Error('Usage: node scripts/ops-executor.js claim <wallet-app|website> [apply|publish|deploy|restart]');
    }
    return claim(repoKey, actionType);
  }

  if (command === 'work-order') {
    const taskId = normalizeValue(rest[0]);
    if (!taskId) {
      throw new Error('Usage: node scripts/ops-executor.js work-order <taskId>');
    }
    return workOrder(taskId);
  }

  if (command === 'finish') {
    const requestId = normalizeValue(rest[0]);
    const status = normalizeValue(rest[1]);
    const summary = normalizeValue(rest[2]);
    const resultMessage = normalizeValue(rest.slice(3).join(' '));

    if (!requestId || !status) {
      throw new Error('Usage: node scripts/ops-executor.js finish <requestId> <done|blocked|canceled> [summary] [resultMessage]');
    }

    return finish(requestId, status, summary, resultMessage);
  }

  if (command === 'list') {
    return list(normalizeValue(rest[0]), normalizeValue(rest[1]), normalizeValue(rest[2]));
  }

  throw new Error(
    'Usage:\n  node scripts/ops-executor.js claim <wallet-app|website> [apply|publish|deploy|restart]\n  node scripts/ops-executor.js work-order <taskId>\n  node scripts/ops-executor.js finish <requestId> <done|blocked|canceled> [summary] [resultMessage]\n  node scripts/ops-executor.js list [repoKey] [status] [actionType]'
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
