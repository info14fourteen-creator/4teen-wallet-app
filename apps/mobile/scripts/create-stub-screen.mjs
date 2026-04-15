import fs from 'node:fs';
import path from 'node:path';

const rawName = process.argv[2];

if (!rawName) {
  console.error('Usage: node ./scripts/create-stub-screen.mjs <page-name>');
  process.exit(1);
}

const safeName = rawName
  .trim()
  .replace(/^\//, '')
  .replace(/\.tsx$/i, '')
  .replace(/[^a-zA-Z0-9-_]/g, '-')
  .replace(/-+/g, '-');

if (!safeName) {
  console.error('Invalid page name.');
  process.exit(1);
}

const eyebrow = safeName.replace(/[-_]+/g, ' ').trim().toUpperCase();

const title = safeName
  .replace(/[-_]+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

const outputPath = path.resolve(`apps/mobile/app/${safeName}.tsx`);

if (fs.existsSync(outputPath)) {
  console.error(`File already exists: ${outputPath}`);
  process.exit(1);
}

const content = `import StubScreen from '../src/ui/stub-screen';

export default function ${title.replace(/\s+/g, '')}Screen() {
  return (
    <StubScreen
      eyebrow="${eyebrow}"
      title="${title}"
      body="This screen is not wired yet."
    />
  );
}
`;

fs.writeFileSync(outputPath, content, 'utf8');
console.log(`Created: ${outputPath}`);
