const { pool } = require('../../db/pool');
const { hasEnoughAirdropResources } = require('../airdrop/telegramBot');
const { hasEnoughAmbassadorAllocationResources } = require('../ambassador/replayQueue');
const { getGasStationRuntimeState } = require('../gasstation/gasStation');
const { recordOpsEvent, resolveOpsEvent } = require('./events');
const { getRuntimeState } = require('./store');
const { bootstrapAdminBotEnv } = require('./telegramAdminBot');

const MONITOR_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_STALE_MS = 70 * 60 * 1000;
const LOW_OPERATOR_BALANCE_SUN = 3_000_000;

let started = false;

async function runMonitorTick(trigger) {
  await bootstrapAdminBotEnv().catch(() => null);

  const dbHealthy = await pool.query('SELECT 1').then(() => true).catch(() => false);
  if (!dbHealthy) {
    await recordOpsEvent({
      source: 'web',
      category: 'database',
      type: 'db_unreachable',
      severity: 'critical',
      title: 'Database check failed',
      message: `Ops monitor DB ping failed on ${trigger}.`,
      fingerprint: 'ops:db_unreachable'
    }).catch(() => null);
  } else {
    await resolveOpsEvent({
      source: 'web',
      category: 'database',
      type: 'db_unreachable',
      fingerprint: 'ops:db_unreachable',
      message: 'Database ping recovered.'
    }).catch(() => null);
  }

  const clockState = await getRuntimeState('clock.heartbeat').catch(() => null);
  const clockPayload = clockState?.value_json || {};
  const heartbeatAt = new Date(clockPayload?.heartbeatAt || clockState?.updated_at || 0).getTime();
  const clockIsStale = !Number.isFinite(heartbeatAt) || heartbeatAt <= 0 || Date.now() - heartbeatAt > CLOCK_STALE_MS;

  if (clockIsStale) {
    await recordOpsEvent({
      source: 'clock',
      category: 'heartbeat',
      type: 'clock_stale',
      severity: 'critical',
      title: 'Clock heartbeat is stale',
      message: 'The clock dyno has not reported a fresh heartbeat in time.',
      fingerprint: 'clock:heartbeat_stale',
      details: {
        trigger,
        heartbeatAt: clockPayload?.heartbeatAt || clockState?.updated_at || null
      }
    }).catch(() => null);
  } else {
    await resolveOpsEvent({
      source: 'clock',
      category: 'heartbeat',
      type: 'clock_stale',
      fingerprint: 'clock:heartbeat_stale',
      message: 'Clock heartbeat recovered.'
    }).catch(() => null);
  }

  const airdropResources = await hasEnoughAirdropResources().catch(() => null);
  if (airdropResources && !airdropResources.hasEnough) {
    await recordOpsEvent({
      source: 'airdrop',
      category: 'resources',
      type: 'resource_floor_low',
      severity: 'warning',
      title: 'Airdrop resources are low',
      message: 'Telegram airdrop wallet resources are below the safe floor.',
      fingerprint: 'airdrop:resources_low',
      details: airdropResources
    }).catch(() => null);
  } else if (airdropResources?.hasEnough) {
    await resolveOpsEvent({
      source: 'airdrop',
      category: 'resources',
      type: 'resource_floor_low',
      fingerprint: 'airdrop:resources_low',
      message: 'Airdrop resources recovered.'
    }).catch(() => null);
  }

  const ambassadorResources = await hasEnoughAmbassadorAllocationResources().catch(() => null);
  if (ambassadorResources && !ambassadorResources.hasEnough) {
    await recordOpsEvent({
      source: 'ambassador',
      category: 'resources',
      type: 'resource_floor_low',
      severity: 'warning',
      title: 'Ambassador allocation resources are low',
      message: 'Operator wallet resources are below the safe floor for ambassador allocation.',
      fingerprint: 'ambassador:resources_low',
      details: ambassadorResources
    }).catch(() => null);
  } else if (ambassadorResources?.hasEnough) {
    await resolveOpsEvent({
      source: 'ambassador',
      category: 'resources',
      type: 'resource_floor_low',
      fingerprint: 'ambassador:resources_low',
      message: 'Ambassador allocation resources recovered.'
    }).catch(() => null);
  }

  const gasState = await getGasStationRuntimeState().catch(() => null);
  const operatorBalanceSun = Number(gasState?.operator?.balanceSun || 0);
  if (gasState?.enabled && operatorBalanceSun > 0 && operatorBalanceSun < LOW_OPERATOR_BALANCE_SUN) {
    await recordOpsEvent({
      source: 'gasstation',
      category: 'balance',
      type: 'operator_balance_low',
      severity: 'warning',
      title: 'Operator TRX balance is low',
      message: 'Operator wallet balance is below the safety buffer for GasStation top-ups.',
      fingerprint: 'gasstation:operator_balance_low',
      details: gasState
    }).catch(() => null);
  } else if (operatorBalanceSun >= LOW_OPERATOR_BALANCE_SUN) {
    await resolveOpsEvent({
      source: 'gasstation',
      category: 'balance',
      type: 'operator_balance_low',
      fingerprint: 'gasstation:operator_balance_low',
      message: 'Operator wallet balance recovered.'
    }).catch(() => null);
  }
}

function startOpsMonitor() {
  if (started) {
    return;
  }

  started = true;

  setTimeout(() => {
    void runMonitorTick('startup');
  }, 10_000);

  setInterval(() => {
    void runMonitorTick('interval');
  }, MONITOR_INTERVAL_MS);
}

module.exports = {
  runMonitorTick,
  startOpsMonitor
};
