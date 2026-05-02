const { syncKnowledgeBase } = require('../src/services/ops/knowledgeBase');

async function main() {
  const result = await syncKnowledgeBase();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
