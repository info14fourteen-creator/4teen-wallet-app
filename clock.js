require('dotenv').config();

const {
  enqueueTelegramClaimDrain,
  syncTelegramWebhook
} = require('./src/services/airdrop/telegramBot');
const {
  enqueueAmbassadorReplayDrain
} = require('./src/services/ambassador/replayQueue');
const { refreshPublicSiteData } = require('./src/services/publicData/siteData');
const { writeOpsHeartbeat } = require('./src/services/ops/events');
const { getAirdropResourceSignal, getAmbassadorResourceSignal } = require('./src/services/ops/resourceSignals');

const HOUR_MS = 60 * 60 * 1000;
const START_DELAY_MS = 15 * 1000;

function summarizeSiteRefresh(payload) {
  const entries = Object.entries(payload && typeof payload === 'object' ? payload : {});
  const summary = {
    total: entries.length,
    ok: 0,
    stale: 0,
    failed: 0,
    endpoints: []
  };

  for (const [key, value] of entries) {
    const ok = Boolean(value?.ok);
    const stale = Boolean(value?.stale);
    const error = String(value?.error || '').trim() || null;

    if (ok) {
      summary.ok += 1;
    } else {
      summary.failed += 1;
    }

    if (stale) {
      summary.stale += 1;
    }

    summary.endpoints.push({
      key,
      ok,
      stale,
      error,
      fetchedAt: value?.fetchedAt || null
    });
  }

  return summary;
}

async function runTick(trigger) {
  try {
    const webhook = await syncTelegramWebhook().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'webhook sync failed'
    }));
    const processed = await enqueueTelegramClaimDrain();
    const ambassadorProcessed = await enqueueAmbassadorReplayDrain();
    const resourceState = await getAirdropResourceSignal().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'resource check failed'
    }));
    const ambassadorResourceState = await getAmbassadorResourceSignal().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'ambassador resource check failed'
    }));
    const publicSiteData = await refreshPublicSiteData().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'public site refresh failed'
    }));
    const siteSummary = summarizeSiteRefresh(publicSiteData);

    await writeOpsHeartbeat('clock.heartbeat', {
      status: 'ok',
      trigger,
      processed,
      ambassadorProcessed,
      app: {
        telegramClaimsProcessed: processed,
        ambassadorWalletsProcessed: Number(ambassadorProcessed?.totalWallets || 0),
        ambassadorWalletsFailed: Number(ambassadorProcessed?.failed || 0),
        airdropHasEnough: resourceState?.hasEnough ?? null,
        ambassadorHasEnough: ambassadorResourceState?.hasEnough ?? null
      },
      site: siteSummary
    }).catch(() => null);

    console.info('[airdrop-clock] tick complete', {
      trigger,
      processed,
      webhook,
      resourceState,
      ambassadorProcessed,
      ambassadorResourceState,
      publicSiteData,
      siteSummary
    });
  } catch (error) {
    await writeOpsHeartbeat('clock.heartbeat', {
      status: 'error',
      trigger,
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => null);
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
