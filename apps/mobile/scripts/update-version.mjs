import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFile = path.resolve(__dirname, '../src/config/app-version.ts');

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

function pad(value) {
  return String(value).padStart(2, '0');
}

function getBuildNumberParts(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  return {
    buildNumber: `${year}${month}${day}${hour}${minute}`,
    generatedAtIso: date.toISOString(),
  };
}

const currentSource = readCurrentVersionSource();

const version = {
  major: extractNumber(currentSource, 'major', 0),
  minor: extractNumber(currentSource, 'minor', 0),
  patch: extractNumber(currentSource, 'patch', 1),
  channel: extractString(currentSource, 'channel', 'alpha'),
  iteration: extractNumber(currentSource, 'iteration', 1),
};

const { buildNumber, generatedAtIso } = getBuildNumberParts();

const nextSource = `export const APP_VERSION = {
  major: ${version.major},
  minor: ${version.minor},
  patch: ${version.patch},
  channel: '${version.channel}',
  iteration: ${version.iteration},
};

export const APP_BUILD = {
  buildNumber: '${buildNumber}',
  generatedAtIso: '${generatedAtIso}',
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  return \`${'${major}.${minor}.${patch}-${channel}.${iteration}'}\`;
}

export function getVersionDisplayString() {
  return getVersionString().toUpperCase();
}

export function getBuildString() {
  return APP_BUILD.buildNumber;
}

export function getBuildDisplayString() {
  return \`BUILD \${getBuildString()}\`;
}

export function getGeneratedAtIso() {
  return APP_BUILD.generatedAtIso;
}

export function getFullVersionString() {
  return \`\${getVersionString()}+\${getBuildString()}\`;
}

export function getCompactVersionDisplayString() {
  return \`\${getVersionDisplayString()} · \${getBuildDisplayString()}\`;
}
`;

writeFileSync(versionFile, nextSource, 'utf8');

console.log(
  `Updated version: ${version.major}.${version.minor}.${version.patch}-${version.channel}.${version.iteration}`
);
console.log(`Updated build: ${buildNumber}`);
console.log(`Generated at: ${generatedAtIso}`);
console.log(`Version file: ${versionFile}`);
