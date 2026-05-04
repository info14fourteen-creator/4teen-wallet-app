const fs = require('fs/promises');
const path = require('path');

async function main() {
  const baseUrl = String(process.env.OPS_EXPORT_BASE_URL || 'https://fourteen-wallet-api-7af291023d36.herokuapp.com').trim();
  const adminToken = String(process.env.ADMIN_SYNC_TOKEN || '').trim();

  if (!adminToken) {
    throw new Error('Missing ADMIN_SYNC_TOKEN');
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/ops/work-orders/export`, {
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Export failed with status ${response.status}`);
  }

  const targetPath = path.resolve(__dirname, '../../../docs/ops/codex-work-orders.md');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, String(payload?.markdown || '# Codex Work Orders\n'), 'utf8');

  process.stdout.write(`Exported codex work orders to ${targetPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
