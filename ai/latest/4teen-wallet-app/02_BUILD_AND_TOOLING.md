# 4teen-wallet-app — BUILD AND TOOLING

Generated: 2026-05-03T00:36:33.306Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 610ab8917a24e2c2868642df815a8bd7e7559b7f
Short commit: 610ab89
Commit subject: Remove file_search from Codex jobs
Commit author: info14fourteen-creator
Commit date: 2026-05-03T05:36:16+05:00

## Included files

- package.json
- .github/workflows/build-wallet-ai-bundle.yml
- .github/workflows/ci.yml
- .github/workflows/ops-remote-runner.yml
- scripts/build-wallet-ai-bundles.mjs
- scripts/ops-remote-runner.mjs

---

## FILE PATH

`package.json`

## FILE CONTENT

```json
{
  "name": "4teen-wallet-app",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.4",
    "typescript": "^5.8.3"
  },
  "dependencies": {
    "expo-crypto": "~15.0.9"
  }
}
```

---

## FILE PATH

`.github/workflows/build-wallet-ai-bundle.yml`

## FILE CONTENT

```yml
name: Build Wallet AI Bundle

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-ai-bundle:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 50

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build wallet AI bundle
        run: node scripts/build-wallet-ai-bundles.mjs

      - name: Commit AI bundle
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

          git add -A ai/latest

          if git diff --cached --quiet; then
            echo "No AI bundle changes to commit."
          else
            git commit -m "chore: update wallet AI bundle [skip ci]"
            git push
          fi
```

---

## FILE PATH

`.github/workflows/ci.yml`

## FILE CONTENT

```yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - name: Install dependencies
        run: pnpm install

      - name: Typecheck
        run: pnpm typecheck || true

      - name: Lint
        run: pnpm lint || true

      - name: Test
        run: pnpm test || true
```

---

## FILE PATH

`.github/workflows/ops-remote-runner.yml`

## FILE CONTENT

```yml
name: Ops Remote Runner

on:
  push:
    paths:
      - '.github/workflows/ops-remote-runner.yml'
      - '.github/scripts/ops-remote-runner.mjs'
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
  repository_dispatch:
    types:
      - ops-execution-request

permissions:
  contents: write
  id-token: write
  pull-requests: write

concurrency:
  group: ops-remote-runner-wallet-app
  cancel-in-progress: false

jobs:
  run:
    if: github.event_name != 'repository_dispatch' || github.event.client_payload.repoKey == 'wallet-app'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Setup pnpm
        run: corepack enable

      - name: Install workspace dependencies
        run: pnpm install --frozen-lockfile

      - name: Process one confirmed request
        env:
          OPS_EXPORT_BASE_URL: ${{ vars.OPS_EXPORT_BASE_URL || github.event.client_payload.opsBaseUrl || 'https://fourteen-wallet-api-7af291023d36.herokuapp.com' }}
          OPS_GITHUB_OIDC_AUDIENCE: ${{ vars.OPS_GITHUB_OIDC_AUDIENCE || '4teen-ops-runner' }}
          OPS_EXECUTOR_RUNNER_ID: github-actions-wallet-app
          GITHUB_TOKEN: ${{ github.token }}
        run: node .github/scripts/ops-remote-runner.mjs
```

---

## FILE PATH

`scripts/build-wallet-ai-bundles.mjs`

## FILE CONTENT

```js
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const AI_DIR = path.join(ROOT, "ai");
const LATEST_DIR = path.join(AI_DIR, "latest");
const TMP_DIR = path.join(AI_DIR, ".latest_build_tmp");

const REPO_NAME = "4teen-wallet-app";

const GROUPS = [
  {
    key: "00_AI_MAP",
    title: "AI MAP",
    matchers: []
  },
  {
    key: "01_PROJECT_OVERVIEW",
    title: "PROJECT OVERVIEW",
    matchers: [
      "README.md",
      "package.json",
      "app.json",
      "app.config.",
      "babel.config.",
      "tsconfig.json",
      "metro.config.",
      "eas.json",
      "expo-env.",
      "docs/",
      "AI_WORKFLOW_RULES.md",
      "WALLET_PROJECT_CONTEXT.md"
    ]
  },
  {
    key: "02_BUILD_AND_TOOLING",
    title: "BUILD AND TOOLING",
    matchers: [
      ".github/workflows/",
      "scripts/",
      "package.json",
      "eslint.config.",
      ".prettierrc",
      ".prettierrc.",
      ".nvmrc",
      "bunfig.toml"
    ]
  },
  {
    key: "03_APP_STRUCTURE",
    title: "APP STRUCTURE",
    matchers: [
      "app/",
      "src/app/",
      "src/screens/",
      "src/navigation/",
      "src/routes/"
    ]
  },
  {
    key: "04_NAVIGATION_AND_SCREENS",
    title: "NAVIGATION AND SCREENS",
    matchers: [
      "app/_layout.",
      "app/index.",
      "app/create-wallet.",
      "app/import-wallet.",
      "app/home.",
      "src/navigation/",
      "src/screens/"
    ]
  },
  {
    key: "05_WALLET_CORE",
    title: "WALLET CORE",
    matchers: [
      "src/wallet/",
      "src/core/",
      "src/store/",
      "src/state/",
      "src/services/wallet/",
      "src/services/balances/",
      "src/services/contracts/",
      "src/services/readonly/",
      "src/lib/wallet/",
      "src/lib/tron/",
      "src/utils/"
    ]
  },
  {
    key: "06_UI_AND_COMPONENTS",
    title: "UI AND COMPONENTS",
    matchers: [
      "src/components/",
      "src/ui/",
      "src/widgets/",
      "assets/",
      "src/theme/",
      "src/styles/"
    ]
  },
  {
    key: "07_CONFIG_AND_NATIVE",
    title: "CONFIG AND NATIVE",
    matchers: [
      "android/",
      "ios/",
      "app.json",
      "app.config.",
      "expo-env.",
      "plugins/",
      "src/config/"
    ]
  }
];

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".expo",
  ".idea",
  ".vscode",
  "ai/latest",
  "ai/.latest_build_tmp"
]);

const IGNORE_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yml",
  ".yaml"
]);

const MAX_SOURCE_FILE_BYTES = 220 * 1024;
const MAX_SECTION_BYTES = 1_400_000;
const MAX_TOTAL_SELECTED_FILES = 220;
const RECENT_COMMITS_COUNT = 10;
const ACTIVE_FILES_WINDOW = 20;
const ACTIVE_FILES_LIMIT = 30;
const TODO_LIMIT = 200;
const TODO_PATTERNS = ["TODO", "FIXME", "HACK", "XXX"];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeDirIfExists(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function shouldIgnore(relPath) {
  const posix = toPosix(relPath);

  if (posix.startsWith("ai/latest/")) return true;
  if (posix.startsWith("ai/.latest_build_tmp/")) return true;
  if (IGNORE_FILES.has(path.basename(posix))) return true;

  return false;
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && ![".github"].includes(entry.name)) {
      continue;
    }

    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    const posix = toPosix(rel);

    if (shouldIgnore(posix)) continue;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(posix) || IGNORE_DIRS.has(entry.name)) continue;
      walk(abs, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    out.push(posix);
  }

  return out;
}

function fileSize(relPath) {
  try {
    return fs.statSync(path.join(ROOT, relPath)).size;
  } catch {
    return 0;
  }
}

function readText(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

function detectLang(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".ts") return "ts";
  if (ext === ".tsx") return "tsx";
  if (ext === ".js") return "js";
  if (ext === ".mjs") return "js";
  if (ext === ".cjs") return "js";
  if (ext === ".jsx") return "jsx";
  if (ext === ".json") return "json";
  if (ext === ".md") return "md";
  if (ext === ".css") return "css";
  if (ext === ".html") return "html";
  if (ext === ".svg") return "svg";
  if (ext === ".xml") return "xml";
  if (ext === ".yml" || ext === ".yaml") return "yml";
  return "txt";
}

function matchesRule(file, rule) {
  const normalizedFile = toPosix(file);
  const normalizedRule = toPosix(rule);

  if (!normalizedRule) return false;

  if (normalizedRule.endsWith("/")) {
    return normalizedFile.startsWith(normalizedRule);
  }

  return (
    normalizedFile === normalizedRule ||
    normalizedFile.startsWith(`${normalizedRule}/`) ||
    normalizedFile.startsWith(`${normalizedRule}.`)
  );
}

function git(args, fallback = "") {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) return fallback;
  return (result.stdout || "").trim();
}

function getRepoInfo() {
  const repository =
    process.env.GITHUB_REPOSITORY || `info14fourteen-creator/${REPO_NAME}`;
  const branch = process.env.GITHUB_REF_NAME || git(["rev-parse", "--abbrev-ref", "HEAD"], "main");

  return {
    repository,
    branch,
    repoPrefixUrl: `https://raw.githubusercontent.com/${repository}/${branch}/ai/latest/${REPO_NAME}`,
    zipUrl: `https://raw.githubusercontent.com/${repository}/${branch}/ai/latest/${REPO_NAME}.zip`
  };
}

function getGitMeta() {
  const commitHash = git(["rev-parse", "HEAD"], "unknown");
  const shortHash = git(["rev-parse", "--short", "HEAD"], "unknown");
  const subject = git(["log", "-1", "--pretty=%s"], "unknown");
  const author = git(["log", "-1", "--pretty=%an"], "unknown");
  const date = git(["log", "-1", "--date=iso-strict", "--pretty=%cd"], "unknown");

  const changedFilesRaw = git(["show", "--name-status", "--format=", "--no-renames", "HEAD"], "");
  const changedFiles = changedFilesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const recentCommitsRaw = git(
    ["log", `-${RECENT_COMMITS_COUNT}`, "--date=short", "--pretty=format:%h | %cd | %s"],
    ""
  );

  const recentCommits = recentCommitsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    commitHash,
    shortHash,
    subject,
    author,
    date,
    changedFiles,
    recentCommits
  };
}

function getActiveFiles() {
  const raw = git(
    ["log", `-${ACTIVE_FILES_WINDOW}`, "--name-only", "--pretty=format:"],
    ""
  );

  const counts = new Map();

  for (const line of raw.split("\n")) {
    const file = line.trim();
    if (!file) continue;

    const posix = toPosix(file);
    if (shouldIgnore(posix)) continue;

    counts.set(posix, (counts.get(posix) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, ACTIVE_FILES_LIMIT)
    .map(([file, count]) => ({ file, count }));
}

function getTodoSurface(allFiles) {
  const results = [];

  for (const file of allFiles) {
    if (results.length >= TODO_LIMIT) break;

    const content = readText(file);
    if (!content) continue;

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matched = TODO_PATTERNS.find((pattern) => line.includes(pattern));
      if (!matched) continue;

      results.push({
        file,
        lineNumber: i + 1,
        tag: matched,
        text: line.trim()
      });

      if (results.length >= TODO_LIMIT) break;
    }
  }

  return results;
}

function buildTree(files) {
  const rootNode = {};

  for (const file of files) {
    const parts = toPosix(file).split("/");
    let current = rootNode;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = isLast ? null : {};
      }

      current = current[part];
    }
  }

  function render(node, indent = "") {
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null;
      const bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });

    let out = "";
    for (const key of keys) {
      if (node[key] === null) {
        out += `${indent}- ${key}\n`;
      } else {
        out += `${indent}- ${key}/\n`;
        out += render(node[key], `${indent}  `);
      }
    }
    return out;
  }

  return render(rootNode);
}

function buildSelectedFiles(groupDefs) {
  const allFiles = walk(ROOT).sort((a, b) => a.localeCompare(b));
  const filtered = allFiles.filter((file) => fileSize(file) <= MAX_SOURCE_FILE_BYTES);

  const selected = [];
  const seen = new Set();

  for (const group of groupDefs) {
    for (const file of filtered) {
      const match = group.matchers.some((rule) => matchesRule(file, rule));
      if (!match) continue;
      if (!seen.has(file)) {
        selected.push(file);
        seen.add(file);
      }
    }
  }

  for (const file of filtered) {
    if (selected.length >= MAX_TOTAL_SELECTED_FILES) break;
    if (!seen.has(file)) {
      selected.push(file);
      seen.add(file);
    }
  }

  return selected.slice(0, MAX_TOTAL_SELECTED_FILES);
}

function buildGroups(files, groupDefs) {
  const assigned = new Set();
  const groups = [];

  for (const groupDef of groupDefs) {
    if (groupDef.key === "00_AI_MAP") continue;

    const matched = files.filter((file) =>
      groupDef.matchers.some((rule) => matchesRule(file, rule))
    );

    const bounded = [];
    let bytes = 0;

    for (const file of matched) {
      const size = fileSize(file);
      if (bytes + size > MAX_SECTION_BYTES) continue;

      bounded.push(file);
      assigned.add(file);
      bytes += size;
    }

    groups.push({
      key: groupDef.key,
      title: groupDef.title,
      files: bounded
    });
  }

  return groups;
}

function buildHeader(lines, info, gitMeta) {
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Repository: ${info.repository}`);
  lines.push(`Branch: ${info.branch}`);
  lines.push(`Last commit: ${gitMeta.commitHash}`);
  lines.push(`Short commit: ${gitMeta.shortHash}`);
  lines.push(`Commit subject: ${gitMeta.subject}`);
  lines.push(`Commit author: ${gitMeta.author}`);
  lines.push(`Commit date: ${gitMeta.date}`);
  lines.push("");
}

function buildMapDoc(allFiles, groups, info, gitMeta) {
  const lines = [];

  lines.push(`# ${REPO_NAME} — AI MAP`);
  lines.push("");
  buildHeader(lines, info, gitMeta);

  lines.push("## Snapshot files");
  lines.push("");
  lines.push("- 00_AI_MAP.md");
  for (const group of groups) {
    lines.push(`- ${group.key}.md`);
  }
  lines.push("- 08_RECENT_CHANGES.md");
  lines.push("- 09_ACTIVE_FILES.md");
  lines.push("- 10_OPEN_TODO_SURFACE.md");
  lines.push("");
  lines.push("## Curated project tree");
  lines.push("");
  lines.push("```txt");
  lines.push(buildTree(allFiles).trimEnd());
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function buildSectionDoc(group, allFiles, info, gitMeta) {
  const lines = [];

  lines.push(`# ${REPO_NAME} — ${group.title}`);
  lines.push("");
  buildHeader(lines, info, gitMeta);

  if (group.key === "01_PROJECT_OVERVIEW") {
    lines.push("## Curated project tree");
    lines.push("");
    lines.push("```txt");
    lines.push(buildTree(allFiles).trimEnd());
    lines.push("```");
    lines.push("");
  }

  lines.push("## Included files");
  lines.push("");

  if (group.files.length === 0) {
    lines.push("- none");
    lines.push("");
    return lines.join("\n");
  }

  for (const file of group.files) {
    lines.push(`- ${file}`);
  }

  lines.push("");

  for (const file of group.files) {
    const lang = detectLang(file);
    const content = readText(file);

    lines.push("---");
    lines.push("");
    lines.push("## FILE PATH");
    lines.push("");
    lines.push(`\`${file}\``);
    lines.push("");
    lines.push("## FILE CONTENT");
    lines.push("");
    lines.push("```" + lang);
    lines.push(content.trimEnd());
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function buildRecentChangesDoc(info, gitMeta) {
  const lines = [];

  lines.push(`# ${REPO_NAME} — RECENT CHANGES`);
  lines.push("");
  buildHeader(lines, info, gitMeta);

  lines.push("## Files changed in last commit");
  lines.push("");

  if (gitMeta.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const line of gitMeta.changedFiles) {
      lines.push(`- ${line}`);
    }
  }

  lines.push("");
  lines.push("## Recent commits");
  lines.push("");

  if (gitMeta.recentCommits.length === 0) {
    lines.push("- none");
  } else {
    for (const line of gitMeta.recentCommits) {
      lines.push(`- ${line}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildActiveFilesDoc(info, gitMeta, activeFiles) {
  const lines = [];

  lines.push(`# ${REPO_NAME} — ACTIVE FILES`);
  lines.push("");
  buildHeader(lines, info, gitMeta);

  lines.push(`## Most frequently changed files in last ${ACTIVE_FILES_WINDOW} commits`);
  lines.push("");

  if (activeFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const item of activeFiles) {
      lines.push(`- ${item.count}x :: ${item.file}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildTodoSurfaceDoc(info, gitMeta, todos) {
  const lines = [];

  lines.push(`# ${REPO_NAME} — OPEN TODO SURFACE`);
  lines.push("");
  buildHeader(lines, info, gitMeta);

  lines.push(`## TODO markers (${TODO_PATTERNS.join(", ")})`);
  lines.push("");

  if (todos.length === 0) {
    lines.push("- none");
  } else {
    for (const item of todos) {
      lines.push(`- ${item.tag} :: ${item.file}:${item.lineNumber} :: ${item.text}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function zipDir(baseOutputDir, repoName) {
  const zipFile = path.join(baseOutputDir, `${repoName}.zip`);
  if (fs.existsSync(zipFile)) {
    fs.rmSync(zipFile, { force: true });
  }

  const result = spawnSync("zip", ["-r", zipFile, repoName], {
    cwd: baseOutputDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create zip for ${repoName}`);
  }
}

function prepareFreshOutput() {
  ensureDir(AI_DIR);
  removeDirIfExists(TMP_DIR);
  ensureDir(TMP_DIR);
}

function finalizeFreshOutput() {
  removeDirIfExists(LATEST_DIR);
  fs.renameSync(TMP_DIR, LATEST_DIR);
}

function main() {
  const info = getRepoInfo();
  const gitMeta = getGitMeta();

  prepareFreshOutput();

  const allFiles = buildSelectedFiles(GROUPS);
  const groups = buildGroups(allFiles, GROUPS);
  const activeFiles = getActiveFiles();
  const todos = getTodoSurface(allFiles);

  const repoDir = path.join(TMP_DIR, REPO_NAME);
  ensureDir(repoDir);

  writeTextFile(path.join(repoDir, "00_AI_MAP.md"), buildMapDoc(allFiles, groups, info, gitMeta));

  for (const group of groups) {
    writeTextFile(
      path.join(repoDir, `${group.key}.md`),
      buildSectionDoc(group, allFiles, info, gitMeta)
    );
  }

  writeTextFile(
    path.join(repoDir, "08_RECENT_CHANGES.md"),
    buildRecentChangesDoc(info, gitMeta)
  );

  writeTextFile(
    path.join(repoDir, "09_ACTIVE_FILES.md"),
    buildActiveFilesDoc(info, gitMeta, activeFiles)
  );

  writeTextFile(
    path.join(repoDir, "10_OPEN_TODO_SURFACE.md"),
    buildTodoSurfaceDoc(info, gitMeta, todos)
  );

  writeTextFile(
    path.join(repoDir, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repository: info.repository,
        branch: info.branch,
        repoName: REPO_NAME,
        lastCommit: {
          hash: gitMeta.commitHash,
          shortHash: gitMeta.shortHash,
          subject: gitMeta.subject,
          author: gitMeta.author,
          date: gitMeta.date
        },
        changedFiles: gitMeta.changedFiles,
        activeFiles,
        todoCount: todos.length,
        snapshotFiles: [
          "00_AI_MAP.md",
          ...groups.map((g) => `${g.key}.md`),
          "08_RECENT_CHANGES.md",
          "09_ACTIVE_FILES.md",
          "10_OPEN_TODO_SURFACE.md"
        ],
        sourceFilesIncluded: allFiles,
        outputDir: info.repoPrefixUrl,
        zipUrl: info.zipUrl
      },
      null,
      2
    )
  );

  zipDir(TMP_DIR, REPO_NAME);
  finalizeFreshOutput();

  console.log(`Built AI bundle for ${REPO_NAME}`);
}

main();
```

---

## FILE PATH

`scripts/ops-remote-runner.mjs`

## FILE CONTENT

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OPS_REPO_KEY = normalizeValue(process.env.OPS_REPO_KEY) || 'wallet-app';
const OPS_BASE_URL = normalizeValue(process.env.OPS_BASE_URL).replace(/\/+$/, '');
const GITHUB_TOKEN = normalizeValue(process.env.GITHUB_TOKEN);
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

async function claimNext() {
  return remoteApi('/ops/execution-requests/claim-github-runner', {
    repoKey: OPS_REPO_KEY,
    runnerId: RUNNER_ID,
    githubToken: GITHUB_TOKEN
  });
}

async function finish(requestId, status, summary, resultMessage, details = {}) {
  return remoteApi(`/ops/execution-requests/${requestId}/finish-github-runner`, {
    runnerId: RUNNER_ID,
    githubToken: GITHUB_TOKEN,
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

function getWorkOrderTaskId(workOrder) {
  return Number(workOrder?.taskId || workOrder?.id || 0);
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

async function handleApply(claimed) {
  const workOrder = claimed?.workOrder;
  if (!workOrder?.readyToImplement) {
    throw new Error('Task does not have a ready work order yet');
  }
  const taskId = getWorkOrderTaskId(workOrder);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    throw new Error('Work order is missing a valid task id');
  }

  ensureGitIdentity();
  checkoutBranch(taskId);

  const contextFiles = [];
  for (const repoPath of uniquePaths(workOrder)) {
    const item = await readFileIfPresent(repoPath);
    if (item) {
      contextFiles.push(item);
    }
  }

  const implementation = await generateImplementation(workOrder, contextFiles, claimed?.credentials || {});
  if (implementation.blocked) {
    throw new Error(normalizeValue(implementation.reason) || 'Model reported blocked');
  }

  await writeChanges(Array.isArray(implementation.files) ? implementation.files : []);
  const files = changedFiles();
  if (!files.length) {
    throw new Error('Model did not produce a working diff');
  }

  const checks = verifyWalletChanges(files);
  const pushed = commitAndPush(taskId, implementation.commitMessage);

  return {
    summary: normalizeValue(implementation.summary) || `Implemented task #${taskId}`,
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

async function handlePublish(claimed) {
  const taskId = Number(claimed?.request?.task_id || 0);
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

async function handleDeploy(claimed) {
  const taskId = Number(claimed?.request?.task_id || 0);
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

  const appName = deployToHeroku(remote.branch, claimed?.credentials || {});
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

async function handleRestart(claimed) {
  const appName = await restartHeroku(claimed?.credentials || {});
  return {
    summary: `Restarted ${appName} for task #${Number(claimed?.request?.task_id || 0)}`,
    resultMessage: `Heroku dynos for ${appName} were restarted.`,
    details: {
      herokuApp: appName
    }
  };
}

async function main() {
  if (!OPS_BASE_URL || !GITHUB_TOKEN) {
    throw new Error('Missing OPS_BASE_URL or GITHUB_TOKEN');
  }

  let claimed = null;
  try {
    claimed = await claimNext();
    if (!claimed?.request) {
      console.log('No confirmed execution requests for this repository. Exiting quietly.');
      return;
    }

    const actionType = normalizeValue(claimed.request.action_type) || 'apply';
    let outcome;
    if (actionType === 'apply') {
      outcome = await handleApply(claimed);
    } else if (actionType === 'publish') {
      outcome = await handlePublish(claimed);
    } else if (actionType === 'deploy') {
      outcome = await handleDeploy(claimed);
    } else if (actionType === 'restart') {
      outcome = await handleRestart(claimed);
    } else {
      throw new Error(`Unsupported action type: ${actionType}`);
    }

    await finish(claimed.request.id, 'done', outcome.summary, outcome.resultMessage, outcome.details);
  } catch (error) {
    console.error(error);
    if (claimed?.request?.id) {
      await finish(
        claimed.request.id,
        'blocked',
        `Remote runner blocked ${normalizeValue(claimed.request.action_type) || 'request'} for task #${Number(claimed.request.task_id || 0)}`,
        normalizeValue(error?.message) || 'Unknown runner failure',
        {
          actionType: normalizeValue(claimed.request.action_type) || 'unknown',
          repoKey: OPS_REPO_KEY
        }
      ).catch(() => null);
    }
    process.exitCode = 1;
  }
}

await main();
```
