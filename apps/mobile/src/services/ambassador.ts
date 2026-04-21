import { TronWeb } from 'tronweb';

import { buildTrongridHeaders, TRONGRID_BASE_URL } from '../config/tron';

export const FOURTEEN_CONTROLLER_ADDRESS = 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ';

const ZERO_ADDRESS_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

type FourteenControllerContract = {
  getBuyerAmbassador: (buyer: string) => {
    call: () => Promise<unknown>;
  };
};

function createReadOnlyTronWeb() {
  return new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
  });
}

function normalizeAddress(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isZeroAddress(value: string) {
  const safe = normalizeAddress(value);
  return !safe || safe === ZERO_ADDRESS_BASE58 || /^41(?:0{40})$/i.test(safe);
}

async function getControllerContract(tronWeb?: TronWeb) {
  const resolved = tronWeb || createReadOnlyTronWeb();
  return (await resolved.contract(
    [
      {
        inputs: [{ internalType: 'address', name: 'buyer', type: 'address' }],
        name: 'getBuyerAmbassador',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    FOURTEEN_CONTROLLER_ADDRESS
  )) as unknown as FourteenControllerContract;
}

export async function getBuyerAmbassadorAddress(buyerWallet: string) {
  const buyer = normalizeAddress(buyerWallet);
  if (!buyer) {
    throw new Error('Buyer wallet is missing.');
  }

  const tronWeb = createReadOnlyTronWeb();
  const contract = await getControllerContract(tronWeb);
  const raw = await contract.getBuyerAmbassador(buyer).call();
  const value = normalizeAddress((raw as { toString?: () => string })?.toString?.() || raw);

  return isZeroAddress(value) ? null : value;
}

export async function waitForBuyerAmbassadorBinding(input: {
  buyerWallet: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = Math.max(2_000, Math.floor(Number(input.timeoutMs || 18_000)));
  const intervalMs = Math.max(750, Math.floor(Number(input.intervalMs || 2_250)));
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ambassadorWallet = await getBuyerAmbassadorAddress(input.buyerWallet).catch(() => null);

    if (ambassadorWallet) {
      return {
        status: 'bound' as const,
        ambassadorWallet,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    status: 'not-bound-yet' as const,
    ambassadorWallet: null,
  };
}
