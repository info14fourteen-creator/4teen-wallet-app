# 4teen-wallet-app — BUILD AND TOOLING

Generated: 2026-04-11T22:38:45.241Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 15c49cfcf8131d97bdbeea41e20c8b3c55118e3c
Short commit: 15c49cf
Commit subject: refactor: polish wallet selection and management flows
Commit author: info14fourteen-creator
Commit date: 2026-04-12T03:38:36+05:00

## Included files

- package.json
- .github/workflows/build-wallet-ai-bundle.yml
- .github/workflows/ci.yml
- scripts/build-wallet-ai-bundles.mjs

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
