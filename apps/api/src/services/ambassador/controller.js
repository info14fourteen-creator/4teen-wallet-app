const env = require('../../config/env');
const { tronWeb } = require('../tron/client');

const controllerAbi = [
  {
    inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
    name: 'getDashboardCore',
    outputs: [
      { internalType: 'bool', name: 'exists', type: 'bool' },
      { internalType: 'bool', name: 'active', type: 'bool' },
      { internalType: 'uint8', name: 'effectiveLevel', type: 'uint8' },
      { internalType: 'uint256', name: 'rewardPercent', type: 'uint256' },
      { internalType: 'uint256', name: 'createdAt', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
    name: 'getDashboardStats',
    outputs: [
      { internalType: 'uint256', name: 'totalBuyers', type: 'uint256' },
      { internalType: 'uint256', name: 'totalVolumeSun', type: 'uint256' },
      { internalType: 'uint256', name: 'totalRewardsAccruedSun', type: 'uint256' },
      { internalType: 'uint256', name: 'totalRewardsClaimedSun', type: 'uint256' },
      { internalType: 'uint256', name: 'claimableRewardsSun', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
    name: 'getDashboardProfile',
    outputs: [
      { internalType: 'bool', name: 'selfRegistered', type: 'bool' },
      { internalType: 'bool', name: 'manualAssigned', type: 'bool' },
      { internalType: 'bool', name: 'overrideEnabled', type: 'bool' },
      { internalType: 'uint8', name: 'currentLevel', type: 'uint8' },
      { internalType: 'uint8', name: 'overrideLevel', type: 'uint8' },
      { internalType: 'bytes32', name: 'slugHash', type: 'bytes32' },
      { internalType: 'bytes32', name: 'metaHash', type: 'bytes32' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
];

function readTupleValue(raw, index, name) {
  const record = raw && typeof raw === 'object' ? raw : null;
  const value = Array.isArray(raw)
    ? raw[index]
    : record?.[index] ?? (name ? record?.[name] : undefined);

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }

  return String(value);
}

function readTupleBoolean(raw, index, name) {
  const value = readTupleValue(raw, index, name).trim().toLowerCase();
  return value === 'true' || value === '1';
}

async function getControllerContract(ownerAddress) {
  if (ownerAddress) {
    tronWeb.setAddress(ownerAddress);
  }

  return tronWeb.contract(controllerAbi, env.FOURTEEN_CONTROLLER_CONTRACT);
}

async function readAmbassadorDashboardOnChain(wallet) {
  const contract = await getControllerContract(wallet);
  const [core, stats, profile] = await Promise.all([
    contract.getDashboardCore(wallet).call(),
    contract.getDashboardStats(wallet).call(),
    contract.getDashboardProfile(wallet).call()
  ]);

  const exists = readTupleBoolean(core, 0, 'exists');

  return {
    exists,
    summary: {
      ambassador_wallet: wallet,
      exists_on_chain: exists,
      active: readTupleBoolean(core, 1, 'active'),
      effective_level: readTupleValue(core, 2, 'effectiveLevel') || '0',
      reward_percent: readTupleValue(core, 3, 'rewardPercent') || '0',
      created_at_chain: readTupleValue(core, 4, 'createdAt') || null,
      self_registered: readTupleBoolean(profile, 0, 'selfRegistered'),
      manual_assigned: readTupleBoolean(profile, 1, 'manualAssigned'),
      override_enabled: readTupleBoolean(profile, 2, 'overrideEnabled'),
      current_level: readTupleValue(profile, 3, 'currentLevel') || '0',
      override_level: readTupleValue(profile, 4, 'overrideLevel') || '0',
      slug_hash: readTupleValue(profile, 5, 'slugHash') || null,
      meta_hash: readTupleValue(profile, 6, 'metaHash') || null,
      total_buyers: readTupleValue(stats, 0, 'totalBuyers') || '0',
      buyers_count: readTupleValue(stats, 0, 'totalBuyers') || '0',
      total_volume_sun: readTupleValue(stats, 1, 'totalVolumeSun') || '0',
      total_rewards_accrued_sun: readTupleValue(stats, 2, 'totalRewardsAccruedSun') || '0',
      total_rewards_claimed_sun: readTupleValue(stats, 3, 'totalRewardsClaimedSun') || '0',
      claimable_rewards_sun: readTupleValue(stats, 4, 'claimableRewardsSun') || '0'
    }
  };
}

module.exports = {
  readAmbassadorDashboardOnChain
};
