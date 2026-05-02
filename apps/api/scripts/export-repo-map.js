// Runner smoke-test: harmless comment for infra validation.
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

function isVisibleCodeFile(name) {
  return !name.startsWith('.') && !name.includes('.bak');
}

async function listFiles(relativeDir, filter) {
  const absoluteDir = path.resolve(ROOT, relativeDir);

  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && filter(entry.name))
      .map((entry) => `${relativeDir}/${entry.name}`)
      .sort();
  } catch (_) {
    return [];
  }
}

async function main() {
  const [mobileScreens, apiRoutes, opsServices] = await Promise.all([
    listFiles('apps/mobile/app', (name) => name.endsWith('.tsx') && isVisibleCodeFile(name)),
    listFiles('apps/api/src/routes', (name) => name.endsWith('.js') && isVisibleCodeFile(name)),
    listFiles('apps/api/src/services/ops', (name) => name.endsWith('.js') && isVisibleCodeFile(name))
  ]);

  const lines = [
    '# 4TEEN Repo Map',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Mobile Screens',
    ...(mobileScreens.length ? mobileScreens.map((file) => `- /${file}`) : ['- none found']),
    '',
    '## API Routes',
    ...(apiRoutes.length ? apiRoutes.map((file) => `- /${file}`) : ['- none found']),
    '',
    '## Ops Services',
    ...(opsServices.length ? opsServices.map((file) => `- /${file}`) : ['- none found'])
  ];

  const targetPath = path.resolve(ROOT, 'docs/ops/repo-map.md');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Exported repo map to ${targetPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
