const env = require('../../config/env');
const { tronWeb } = require('../tron/client');
const { rentResourcesForWallet } = require('../gasstation/gasStation');

function normalizeValue(value) {
  return String(value || '').trim();
}

async function getAmbassadorAllocationWalletResources() {
  const walletAddress = normalizeValue(env.OPERATOR_WALLET);

  if (!walletAddress) {
    throw new Error('OPERATOR_WALLET is not configured');
  }

  const resources = await tronWeb.trx.getAccountResources(walletAddress);
  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);
  const energyAvailable = Math.max(0, energyLimit - energyUsed);
  const freeNetLimit = Number(resources?.freeNetLimit || 0);
  const freeNetUsed = Number(resources?.freeNetUsed || 0);
  const freeNetAvailable = Math.max(0, freeNetLimit - freeNetUsed);
  const netLimit = Number(resources?.NetLimit || 0);
  const netUsed = Number(resources?.NetUsed || 0);
  const netAvailable = Math.max(0, netLimit - netUsed);
  const bandwidthAvailable = freeNetAvailable + netAvailable;

  return {
    walletAddress,
    energyAvailable,
    bandwidthAvailable
  };
}

async function hasEnoughAmbassadorAllocationResources() {
  const resources = await getAmbassadorAllocationWalletResources();
  const energyAfter =
    resources.energyAvailable - Number(env.AMBASSADOR_ALLOCATION_REQUIRED_ENERGY || 0);
  const bandwidthAfter =
    resources.bandwidthAvailable - Number(env.AMBASSADOR_ALLOCATION_REQUIRED_BANDWIDTH || 0);

  return {
    ...resources,
    energyAfter,
    bandwidthAfter,
    hasEnough:
      energyAfter >= Number(env.AMBASSADOR_ALLOCATION_MIN_ENERGY_FLOOR || 0) &&
      bandwidthAfter >= Number(env.AMBASSADOR_ALLOCATION_MIN_BANDWIDTH_FLOOR || 0)
  };
}

async function ensureAmbassadorAllocationResources(context = {}) {
  let resourceState = await hasEnoughAmbassadorAllocationResources();
  let rentalResult = null;

  if (!resourceState.hasEnough) {
    rentalResult = await rentResourcesForWallet({
      receiveAddress: resourceState.walletAddress,
      energyNum: Number(env.AMBASSADOR_ALLOCATION_REQUIRED_ENERGY || 0),
      bandwidthNum: Number(env.AMBASSADOR_ALLOCATION_REQUIRED_BANDWIDTH || 0),
      requestPrefix: 'ambassador-allocation',
      context: {
        purpose: 'ambassador_allocation',
        ...context
      }
    });

    resourceState = await hasEnoughAmbassadorAllocationResources();
  }

  return {
    resourceState,
    rentalResult
  };
}

module.exports = {
  ensureAmbassadorAllocationResources,
  getAmbassadorAllocationWalletResources,
  hasEnoughAmbassadorAllocationResources
};
