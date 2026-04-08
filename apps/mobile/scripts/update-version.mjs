import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCommitCount() {
  try {
    const output = execSync('git rev-list --count HEAD', {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../../..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const count = Number(output);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

const version = {
  major: 0,
  minor: 0,
  patch: getCommitCount(),
  channel: 'alpha',
  iteration: 1,
};

const content = `export const APP_VERSION = {
  major: ${version.major},
  minor: ${version.minor},
  patch: ${version.patch},
  channel: '${version.channel}',
  iteration: ${version.iteration},
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  return \`\${major}.\${minor}.\${patch}-\${channel}.\${iteration}\`;
}
`;

const outFile = path.resolve(__dirname, '../src/config/app-version.ts');
writeFileSync(outFile, content, 'utf8');

console.log(`Updated version: ${version.major}.${version.minor}.${version.patch}-${version.channel}.${version.iteration}`);
