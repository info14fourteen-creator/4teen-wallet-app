import { TronWeb, providers } from 'tronweb';
import { FOURTEEN_API_BASE_URL, TRONGRID_BASE_URL } from '../../config/tron';
import type { AmbassadorCabinetDashboard } from '../../services/ambassador';
import { readJson, ReadResponseError } from './client';
import { normalizeAddress } from './address';
import { historyRows, type ChainEvent, type HistoryKind } from './model';

export const PROTOCOL_CONTRACTS = {
  token: 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A',
  controller: 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ',
  airdrop: 'TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ',
  liquidity: 'TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ',
} as const;

function checkAddress(address: string) {
  if (!TronWeb.isAddress(address)) throw new Error('Invalid address');
}

function createReader(address: string, signal: AbortSignal) {
  const provider = new providers.HttpProvider(TRONGRID_BASE_URL, 15000);
  const transport = provider.instance;
  provider.instance = {
    request<R>(config: Record<string, unknown>) {
      return transport.request<R>({ ...config, signal });
    },
  };
  const reader = new TronWeb({ fullNode: provider, solidityNode: provider });
  reader.setAddress(address);
  return reader;
}

export async function loadCabinet(address: string, signal: AbortSignal) {
  checkAddress(address);
  let payload: { ok?: boolean; result?: AmbassadorCabinetDashboard };
  try {
    payload = await readJson(`${FOURTEEN_API_BASE_URL}/ambassador/cabinet/${address}?limit=100&offset=0`, signal);
  } catch (error) {
    if (!(error instanceof ReadResponseError) || error.status !== 404 || error.responseError !== 'Ambassador not found') throw error;
    // The API also returns 404 when its upstream fails. Confirm absence on-chain.
    const contract = await createReader(address, signal).contract([{
      type: 'function', name: 'ambassadorExists', stateMutability: 'view',
      inputs: [{ name: 'ambassador', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
    }], PROTOCOL_CONTRACTS.controller);
    const exists = await contract.ambassadorExists(address).call();
    if (exists === false) return null;
    throw error;
  }
  if (!payload.ok || !payload.result?.summary) throw new Error('Cabinet unavailable');
  const cabinet = payload.result;
  if (cabinet.summary.ambassador_wallet !== address) throw new Error('Cabinet address mismatch');
  if (cabinet.source?.onChain === false) throw new Error('On-chain records unavailable');
  if (cabinet.source?.db === false || !Array.isArray(cabinet.purchasesRows)) throw new Error('History unavailable');
  return cabinet;
}

export async function loadHistory(kind: HistoryKind, address: string, signal: AbortSignal, cursor?: string) {
  checkAddress(address);
  const contract = kind === 'airdrop' ? PROTOCOL_CONTRACTS.airdrop : PROTOCOL_CONTRACTS.token;
  const events: ChainEvent[] = [];
  let fingerprint = cursor;
  const seen = new Set<string>(cursor ? [cursor] : []);
  // Bounded scan. A cursor is returned rather than claiming the history is complete.
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({
      event_name: kind === 'airdrop' ? 'Airdropped' : 'BuyTokens',
      only_confirmed: 'true', order_by: 'block_timestamp,desc', limit: '200',
      ...(fingerprint ? { fingerprint } : {}),
    });
    const response = await readJson<{ data?: ChainEvent[]; meta?: { fingerprint?: string }; success?: boolean }>(
      `${TRONGRID_BASE_URL}/v1/contracts/${contract}/events?${query}`, signal,
    );
    if (response.success === false || !Array.isArray(response.data)) throw new Error('History unavailable');
    events.push(...response.data);
    fingerprint = response.meta?.fingerprint;
    if (!fingerprint) break;
    if (seen.has(fingerprint)) throw new Error('Invalid history cursor');
    seen.add(fingerprint);
  }
  return { rows: historyRows(kind, address, events, normalizeAddress), cursor: fingerprint };
}

export async function loadTokenBalances(address: string, signal: AbortSignal) {
  checkAddress(address);
  const reader = createReader(address, signal);
  const abi = ['balanceOf', 'lockedBalanceOf'].map(name => ({
    type: 'function', name, stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  }));
  const contract = await reader.contract(abi, PROTOCOL_CONTRACTS.token);
  const [total, locked] = await Promise.all([
    contract.balanceOf(address).call(), contract.lockedBalanceOf(address).call(),
  ]);
  return { total: String(total), locked: String(locked) };
}

export async function loadLiquidityBalance(signal: AbortSignal) {
  const payload = await readJson<{ data?: { balance?: number }[]; success?: boolean }>(
    `${TRONGRID_BASE_URL}/v1/accounts/${PROTOCOL_CONTRACTS.liquidity}`, signal,
  );
  if (payload.success === false || !Array.isArray(payload.data) || !payload.data.length) throw new Error('Balance unavailable');
  return String(payload.data[0].balance ?? 0);
}
