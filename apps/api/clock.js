require('dotenv').config();

const {
  enqueueTelegramClaimDrain,
  hasEnoughAirdropResources,
  syncTelegramWebhook
} = require('./src/services/airdrop/telegramBot');

const HOUR_MS = 60 * 60 * 1000;
const START_DELAY_MS = 15 * 1000;

async function runTick(trigger) {
  try {
    const webhook = await syncTelegramWebhook().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'webhook sync failed'
    }));
    const resourceState = await hasEnoughAirdropResources().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'resource check failed'
    }));
    const processed = await enqueueTelegramClaimDrain();

    console.info('[airdrop-clock] tick complete', {
      trigger,
      processed,
      webhook,
      resourceState
    });
  } catch (error) {
    console.error('[airdrop-clock] tick failed', {
      trigger,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log('[airdrop-clock] started');

setTimeout(() => {
  void runTick('startup');
}, START_DELAY_MS);

setInterval(() => {
  void runTick('hourly');
}, HOUR_MS);

