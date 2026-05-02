const fs = require('fs/promises');
const path = require('path');
const { buildKnowledgeBaseExport } = require('../src/services/ops/knowledgeBase');

async function main() {
  const payload = await buildKnowledgeBaseExport();
  const targetPath = path.resolve(__dirname, '../../../docs/ops/knowledge-base.md');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, String(payload?.markdown || '# 4TEEN Ops Knowledge Base\n'), 'utf8');

  process.stdout.write(`Exported knowledge base to ${targetPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
