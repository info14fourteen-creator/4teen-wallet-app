import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFile = path.resolve(__dirname, '../src/config/app-version.ts');
const repoRoot = path.resolve(__dirname, '../../..');

function getCommitCount() {
  try {
    const output = execSync('git rev-list --count HEAD', {
      encoding: 'utf8',
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const count = Number(output);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

function extractNumber(source, key, fallback) {
  const match = source.match(new RegExp(`${key}:\\s*(\\d+)`));
  if (!match) return fallback;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

function extractString(source, key, fallback) {
  const match = source.match(new RegExp(`${key}:\\s*'([^']+)'`));
  return match?.[1] ?? fallback;
}

function readCurrentVersionSource() {
  try {
    return readFileSync(versionFile, 'utf8');
  } catch {
    return '';
  }
}

const currentSource = readCurrentVersionSource();

const version = {
  major: extractNumber(currentSource, 'major', 0),
  minor: extractNumber(currentSource, 'minor', 0),
  patch: extractNumber(currentSource, 'patch', 1),
  channel: extractString(currentSource, 'channel', 'alpha'),
  iteration: extractNumber(currentSource, 'iteration', 1),
};

const commitCount = getCommitCount();
const buildNumber = String(commitCount).padStart(4, '0');

const nextSource = `export const APP_VERSION = {
  major: ${version.major},
  minor: ${version.minor},
  patch: ${version.patch},
  channel: '${version.channel}',
  iteration: ${version.iteration},
};

export const APP_BUILD = {
  commitCount: ${commitCount},
  buildNumber: '${buildNumber}',
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  return \`\${major}.\${minor}.\${patch}-\${channel}.\${iteration}\`;
}

export function getBuildString() {
  return APP_BUILD.buildNumber;
}

export function getCommitCount() {
  return APP_BUILD.commitCount;
}

export function getFullVersionString() {
  return \`\${getVersionString()}+\${getBuildString()}\`;
}
`;

writeFileSync(versionFile, nextSource, 'utf8');

console.log(`Updated version: ${version.major}.${version.minor}.${version.patch}-${version.channel}.${version.iteration}`);
console.log(`Updated build: ${buildNumber} (commits: ${commitCount})`);
