const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const { File: UndiciFile, FormData, fetch } = require('undici');
const { File: BufferFile } = require('buffer');
const env = require('../../config/env');
const { buildProductNotesMarkdown, listProductNotes } = require('./productNotes');
const { buildTasksMarkdown, listTasks } = require('./tasks');
const { getRuntimeState, setRuntimeState } = require('./store');

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const KNOWLEDGE_STATE_KEY = 'ops.ai.knowledge';
const DEFAULT_VECTOR_STORE_NAME = '4TEEN Ops Knowledge';
const FileCtor = globalThis.File || UndiciFile || BufferFile;

function resolveRepoRoot() {
  const candidates = [
    path.resolve(__dirname, '../../../../../'),
    path.resolve(__dirname, '../../../'),
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../../')
  ];

  for (const candidate of candidates) {
    const hasWorkspaceRoot = existsSync(path.join(candidate, 'pnpm-lock.yaml')) || existsSync(path.join(candidate, '.git'));
    const hasAppRoot = existsSync(path.join(candidate, 'package.json')) && existsSync(path.join(candidate, 'src', 'routes'));
    if (hasWorkspaceRoot || hasAppRoot) {
      return candidate;
    }
  }

  return path.resolve(__dirname, '../../../');
}

const REPO_ROOT = resolveRepoRoot();

function normalizeValue(value) {
  return String(value || '').trim();
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasKnowledgeBaseConfig() {
  return Boolean(normalizeValue(env.OPENAI_API_KEY));
}

function buildOpenAiHeaders(extra = {}) {
  const headers = {
    Authorization: `Bearer ${normalizeValue(env.OPENAI_API_KEY)}`,
    ...extra
  };

  if (normalizeValue(env.OPENAI_ORG_ID)) {
    headers['OpenAI-Organization'] = normalizeValue(env.OPENAI_ORG_ID);
  }

  if (normalizeValue(env.OPENAI_PROJECT_ID)) {
    headers['OpenAI-Project'] = normalizeValue(env.OPENAI_PROJECT_ID);
  }

  return headers;
}

async function openAiJson(method, urlPath, body) {
  if (!hasKnowledgeBaseConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${urlPath}`, {
    method,
    headers: buildOpenAiHeaders({
      'Content-Type': 'application/json'
    }),
    body: body == null ? undefined : JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI ${method} ${urlPath} failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function openAiGet(urlPath) {
  if (!hasKnowledgeBaseConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${urlPath}`, {
    method: 'GET',
    headers: buildOpenAiHeaders()
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI GET ${urlPath} failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function openAiDelete(urlPath) {
  if (!hasKnowledgeBaseConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${urlPath}`, {
    method: 'DELETE',
    headers: buildOpenAiHeaders()
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI DELETE ${urlPath} failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function openAiMultipart(urlPath, formData) {
  if (!hasKnowledgeBaseConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${urlPath}`, {
    method: 'POST',
    headers: buildOpenAiHeaders(),
    body: formData
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI POST ${urlPath} failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function fileExists(relativePath) {
  try {
    await fs.access(path.resolve(REPO_ROOT, relativePath));
    return true;
  } catch (_) {
    return false;
  }
}

async function listMarkdownFiles(relativeDir) {
  const absoluteDir = path.resolve(REPO_ROOT, relativeDir);

  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name))
      .sort();
  } catch (_) {
    return [];
  }
}

async function readFileSafe(relativePath) {
  try {
    return await fs.readFile(path.resolve(REPO_ROOT, relativePath), 'utf8');
  } catch (_) {
    return '';
  }
}

function isActiveScreenFile(fileName) {
  return fileName.endsWith('.tsx') && !fileName.includes('.bak') && !fileName.startsWith('.');
}

async function buildMobileScreensSection() {
  const appDir = path.resolve(REPO_ROOT, 'apps/mobile/app');
  let entries = [];

  try {
    entries = await fs.readdir(appDir, { withFileTypes: true });
  } catch (_) {
    return {
      count: 0,
      lines: ['No mobile app screens found.']
    };
  }

  const screens = entries
    .filter((entry) => entry.isFile() && isActiveScreenFile(entry.name))
    .map((entry) => entry.name)
    .sort();

  return {
    count: screens.length,
    lines: screens.length
      ? screens.map((fileName) => `- /apps/mobile/app/${fileName}`)
      : ['No active screens found.']
  };
}

function extractRoutesFromSource(source) {
  const routes = [];
  const regex = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let match = null;

  while ((match = regex.exec(source))) {
    routes.push({
      method: String(match[1] || '').toUpperCase(),
      path: normalizeValue(match[2])
    });
  }

  return routes;
}

async function buildApiRoutesSection() {
  const routesDir = path.resolve(REPO_ROOT, 'apps/api/src/routes');
  let entries = [];

  try {
    entries = await fs.readdir(routesDir, { withFileTypes: true });
  } catch (_) {
    return {
      count: 0,
      lines: ['No API route files found.']
    };
  }

  const lines = [];
  let count = 0;

  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.js')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join('apps/api/src/routes', entry.name);
    const source = await readFileSafe(relativePath);
    const routes = extractRoutesFromSource(source);
    count += routes.length;

    lines.push(`- /${relativePath}`);
    if (routes.length) {
      routes.slice(0, 12).forEach((route) => {
        lines.push(`  - ${route.method} ${route.path}`);
      });
    } else {
      lines.push('  - no inline router paths found');
    }
  }

  return {
    count,
    lines: lines.length ? lines : ['No API routes found.']
  };
}

async function buildOpsServicesSection() {
  const servicesDir = path.resolve(REPO_ROOT, 'apps/api/src/services/ops');
  let entries = [];

  try {
    entries = await fs.readdir(servicesDir, { withFileTypes: true });
  } catch (_) {
    return {
      count: 0,
      lines: ['No ops services found.']
    };
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();

  return {
    count: files.length,
    lines: files.length
      ? files.map((fileName) => `- /apps/api/src/services/ops/${fileName}`)
      : ['No ops services found.']
  };
}

async function collectSourceDocs() {
  const docs = unique([
    ...(await listMarkdownFiles('docs/ops')),
    ...(await listMarkdownFiles('release')),
    ...(await fileExists('archive/README.md') ? ['archive/README.md'] : [])
  ]).filter((relativePath) => relativePath !== 'docs/ops/knowledge-base.md');

  const items = [];

  for (const relativePath of docs) {
    const content = normalizeValue(await readFileSafe(relativePath));
    if (!content) {
      continue;
    }

    items.push({
      path: relativePath,
      content
    });
  }

  return items;
}

async function buildKnowledgeBaseExport() {
  const [notes, tasks, docs, routes, screens, opsServices] = await Promise.all([
    listProductNotes(50, { onlyOpen: false }).catch(() => []),
    listTasks(50, { includeDone: true }).catch(() => []),
    collectSourceDocs(),
    buildApiRoutesSection(),
    buildMobileScreensSection(),
    buildOpsServicesSection()
  ]);

  const lines = [
    '# 4TEEN Ops Knowledge Base',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Ground rules',
    '- Live ops data from Postgres and runtime checks is the source of truth for current health and incidents.',
    '- This knowledge base is supporting context for repo structure, release planning, docs, screens, and recent product intent.',
    '- Do not treat any secret value as available here. This export contains paths and summaries, not credentials.',
    '',
    '## Repo Map',
    `- Mobile screens indexed: ${screens.count}`,
    `- API routes indexed: ${routes.count}`,
    `- Ops services indexed: ${opsServices.count}`,
    `- Markdown docs included: ${docs.length}`,
    `- Tasks included: ${tasks.length}`,
    '',
    '### Mobile Screens',
    ...screens.lines,
    '',
    '### API Routes',
    ...routes.lines,
    '',
    '### Ops Services',
    ...opsServices.lines,
    '',
    '## Product Backlog',
    ...String(buildProductNotesMarkdown(notes) || '').split('\n')
  ];

  lines.push('');
  lines.push('## Task Board');
  lines.push(...String(buildTasksMarkdown(tasks) || '').split('\n'));

  for (const doc of docs) {
    lines.push('');
    lines.push(`## Source Doc: /${doc.path}`);
    lines.push('');
    lines.push(doc.content);
  }

  return {
    generatedAt: new Date().toISOString(),
    includedFiles: docs.map((item) => item.path),
    summary: {
      mobileScreens: screens.count,
      apiRoutes: routes.count,
      opsServices: opsServices.count,
      docs: docs.length,
      productNotes: notes.length,
      tasks: tasks.length
    },
    markdown: lines.join('\n')
  };
}

async function getKnowledgeBaseState() {
  const state = await getRuntimeState(KNOWLEDGE_STATE_KEY).catch(() => null);
  return state?.value_json && typeof state.value_json === 'object' ? state.value_json : {};
}

async function getKnowledgeBaseStatus() {
  const state = await getKnowledgeBaseState();
  const vectorStoreId = normalizeValue(env.OPENAI_OPS_VECTOR_STORE_ID) || normalizeValue(state.vectorStoreId);

  return {
    configured: hasKnowledgeBaseConfig(),
    vectorStoreId: vectorStoreId || null,
    lastSyncedAt: normalizeValue(state.lastSyncedAt) || null,
    lastFileId: normalizeValue(state.lastFileId) || null,
    lastFilename: normalizeValue(state.lastFilename) || null,
    fileStatus: normalizeValue(state.fileStatus) || null,
    includedFiles: Array.isArray(state.includedFiles) ? state.includedFiles : [],
    summary: state.summary && typeof state.summary === 'object' ? state.summary : null
  };
}

async function ensureVectorStore() {
  const state = await getKnowledgeBaseState();
  const configuredId = normalizeValue(env.OPENAI_OPS_VECTOR_STORE_ID);
  const knownId = configuredId || normalizeValue(state.vectorStoreId);

  if (knownId) {
    const store = await openAiGet(`/vector_stores/${encodeURIComponent(knownId)}`);
    return {
      created: false,
      store
    };
  }

  const store = await openAiJson('POST', '/vector_stores', {
    name: normalizeValue(env.OPENAI_OPS_VECTOR_STORE_NAME) || DEFAULT_VECTOR_STORE_NAME,
    metadata: {
      app: '4teen',
      purpose: 'ops_knowledge'
    }
  });

  return {
    created: true,
    store
  };
}

async function uploadKnowledgeFile(markdown, generatedAt) {
  const formData = new FormData();
  const suffix = normalizeValue(generatedAt).replace(/[:.]/g, '-');
  const fileName = `4teen-ops-knowledge-${suffix || Date.now()}.md`;

  formData.set('purpose', 'user_data');
  formData.set('file', new FileCtor([markdown], fileName, { type: 'text/markdown' }));

  const payload = await openAiMultipart('/files', formData);
  return {
    id: payload?.id,
    filename: payload?.filename || fileName
  };
}

async function attachFileToVectorStore(vectorStoreId, fileId) {
  return openAiJson('POST', `/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
    file_id: fileId,
    attributes: {
      category: 'ops_knowledge',
      app: '4teen'
    }
  });
}

async function waitForVectorStoreFile(vectorStoreId, fileId, options = {}) {
  const maxAttempts = Math.max(3, Number(options?.maxAttempts || 20));
  const delayMs = Math.max(500, Number(options?.delayMs || 1500));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const file = await openAiGet(
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`
    );
    const status = normalizeValue(file?.status).toLowerCase();

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      return file;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  return openAiGet(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`
  );
}

async function syncKnowledgeBase(options = {}) {
  if (!hasKnowledgeBaseConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const previousState = await getKnowledgeBaseState();
  const exportPayload = await buildKnowledgeBaseExport();
  const { store, created } = await ensureVectorStore();
  const uploadedFile = await uploadKnowledgeFile(exportPayload.markdown, exportPayload.generatedAt);
  await attachFileToVectorStore(store.id, uploadedFile.id);
  const indexedFile = await waitForVectorStoreFile(store.id, uploadedFile.id, options);
  const refreshedStore = await openAiGet(`/vector_stores/${encodeURIComponent(store.id)}`).catch(() => store);

  const nextState = {
    vectorStoreId: store.id,
    lastFileId: uploadedFile.id,
    lastFilename: uploadedFile.filename,
    lastSyncedAt: exportPayload.generatedAt,
    fileStatus: normalizeValue(indexedFile?.status) || 'unknown',
    includedFiles: exportPayload.includedFiles,
    summary: exportPayload.summary
  };

  await setRuntimeState(KNOWLEDGE_STATE_KEY, nextState).catch(() => null);

  const previousFileId = normalizeValue(previousState?.lastFileId);
  if (previousFileId && previousFileId !== uploadedFile.id) {
    await openAiDelete(`/files/${encodeURIComponent(previousFileId)}`).catch(() => null);
  }

  return {
    ok: true,
    createdVectorStore: created,
    vectorStoreId: store.id,
    fileId: uploadedFile.id,
    filename: uploadedFile.filename,
    fileStatus: normalizeValue(indexedFile?.status) || 'unknown',
    includedFiles: exportPayload.includedFiles,
    summary: exportPayload.summary,
    usageBytes: refreshedStore?.usage_bytes || null
  };
}

async function getKnowledgeSearchTool(options = {}) {
  const status = await getKnowledgeBaseStatus();
  if (!status.configured || !status.vectorStoreId) {
    return null;
  }

  return {
    type: 'file_search',
    vector_store_ids: [status.vectorStoreId],
    max_num_results: Math.max(1, Math.min(Number(options?.maxNumResults || 4), 8))
  };
}

module.exports = {
  buildKnowledgeBaseExport,
  getKnowledgeBaseStatus,
  getKnowledgeSearchTool,
  hasKnowledgeBaseConfig,
  syncKnowledgeBase
};
