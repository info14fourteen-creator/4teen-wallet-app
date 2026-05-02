require('dotenv').config();

const {
  enqueueTelegramClaimDrain,
  hasEnoughAirdropResources,
  syncTelegramWebhook
} = require('./src/services/airdrop/telegramBot');
const {
  enqueueAmbassadorReplayDrain,
  hasEnoughAmbassadorAllocationResources
} = require('./src/services/ambassador/replayQueue');
const { runLiquidityDaily } = require('./src/services/liquidity/execution');
const { recordOpsEvent, resolveOpsEvent, writeOpsHeartbeat } = require('./src/services/ops/events');
const { broadcastLiquidityDailyReport } = require('./src/services/ops/telegramAdminBot');

const HOUR_MS = 60 * 60 * 1000;
const START_DELAY_MS = 15 * 1000;

async function runTick(trigger) {
  const startedAt = new Date().toISOString();

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
    const ambassadorResourceState =
      await hasEnoughAmbassadorAllocationResources().catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'ambassador resource check failed'
      }));
    const ambassadorProcessed = await enqueueAmbassadorReplayDrain();
    const liquidityDaily = await runLiquidityDaily({
      now: new Date(),
      trigger,
    }).catch((error) => ({
      attempted: true,
      ok: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'liquidity daily failed'
    }));

    await writeOpsHeartbeat('clock.heartbeat', {
      trigger,
      status: 'ok',
      startedAt,
      processed,
      webhook,
      resourceState,
      ambassadorProcessed,
      ambassadorResourceState,
      liquidityDaily
    }).catch(() => null);

    if (webhook?.ok === false) {
      await recordOpsEvent({
        source: 'clock',
        category: 'webhook',
        type: 'airdrop_webhook_sync_failed',
        severity: 'error',
        title: 'Airdrop Telegram webhook sync failed',
        message: webhook.error || 'Webhook sync failed',
        fingerprint: 'clock:airdrop_webhook_sync_failed',
        details: webhook
      }).catch(() => null);
    } else {
      await resolveOpsEvent({
        source: 'clock',
        category: 'webhook',
        type: 'airdrop_webhook_sync_failed',
        fingerprint: 'clock:airdrop_webhook_sync_failed',
        message: 'Airdrop Telegram webhook sync recovered.'
      }).catch(() => null);
    }

    if (resourceState?.hasEnough === false) {
      await recordOpsEvent({
        source: 'clock',
        category: 'resources',
        type: 'airdrop_resources_low',
        severity: 'warning',
        title: 'Airdrop resources are below safe floor',
        message: 'Clock tick detected low Telegram airdrop resources.',
        fingerprint: 'clock:airdrop_resources_low',
        details: resourceState
      }).catch(() => null);
    } else if (resourceState?.hasEnough === true) {
      await resolveOpsEvent({
        source: 'clock',
        category: 'resources',
        type: 'airdrop_resources_low',
        fingerprint: 'clock:airdrop_resources_low',
        message: 'Airdrop resources recovered.'
      }).catch(() => null);
    }

    if (ambassadorResourceState?.hasEnough === false) {
      await recordOpsEvent({
        source: 'clock',
        category: 'resources',
        type: 'ambassador_resources_low',
        severity: 'warning',
        title: 'Ambassador resources are below safe floor',
        message: 'Clock tick detected low ambassador allocation resources.',
        fingerprint: 'clock:ambassador_resources_low',
        details: ambassadorResourceState
      }).catch(() => null);
    } else if (ambassadorResourceState?.hasEnough === true) {
      await resolveOpsEvent({
        source: 'clock',
        category: 'resources',
        type: 'ambassador_resources_low',
        fingerprint: 'clock:ambassador_resources_low',
        message: 'Ambassador allocation resources recovered.'
      }).catch(() => null);
    }

    if (liquidityDaily?.attempted && liquidityDaily?.ok === false) {
      await recordOpsEvent({
        source: 'clock',
        category: 'liquidity',
        type: 'liquidity_daily_failed',
        severity: 'error',
        title: 'Liquidity daily pass failed',
        message: liquidityDaily.error || 'Liquidity daily execution failed.',
        fingerprint: 'clock:liquidity_daily_failed',
        details: liquidityDaily
      }).catch(() => null);
    } else if (liquidityDaily?.attempted && liquidityDaily?.ok === true) {
      await resolveOpsEvent({
        source: 'clock',
        category: 'liquidity',
        type: 'liquidity_daily_failed',
        fingerprint: 'clock:liquidity_daily_failed',
        message: 'Liquidity daily execution recovered.'
      }).catch(() => null);
    }

    if (liquidityDaily?.attempted) {
      try {
        await broadcastLiquidityDailyReport(liquidityDaily);
        await resolveOpsEvent({
          source: 'clock',
          category: 'telegram',
          type: 'liquidity_daily_report_failed',
          fingerprint: 'clock:liquidity_daily_report_failed',
          message: 'Liquidity daily report delivery recovered.'
        }).catch(() => null);
      } catch (error) {
        await recordOpsEvent({
          source: 'clock',
          category: 'telegram',
          type: 'liquidity_daily_report_failed',
          severity: 'warning',
          title: 'Liquidity daily report could not be sent to Telegram',
          message: error instanceof Error ? error.message : String(error),
          fingerprint: 'clock:liquidity_daily_report_failed',
          details: {
            liquidityDaily,
            error: error instanceof Error ? error.message : String(error)
          }
        }).catch(() => null);
      }
    }

    await resolveOpsEvent({
      source: 'clock',
      category: 'heartbeat',
      type: 'tick_failed',
      fingerprint: 'clock:tick_failed',
      message: 'Clock tick recovered.'
    }).catch(() => null);

    console.info('[airdrop-clock] tick complete', {
      trigger,
      processed,
      webhook,
      resourceState,
      ambassadorProcessed,
      ambassadorResourceState,
      liquidityDaily
    });
  } catch (error) {
    await writeOpsHeartbeat('clock.heartbeat', {
      trigger,
      status: 'failed',
      startedAt,
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => null);
    await recordOpsEvent({
      source: 'clock',
      category: 'heartbeat',
      type: 'tick_failed',
      severity: 'critical',
      title: 'Clock tick failed',
      message: error instanceof Error ? error.message : String(error),
      fingerprint: 'clock:tick_failed'
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
