import { TronWeb } from 'tronweb';

import {
  TRONGRID_API_KEYS,
  TRONGRID_BASE_URL,
} from '../../config/tron';
import {
  TRX_TOKEN_ID,
  getTokenDetails,
} from '../tron/api';
import {
  getActiveWallet,
  getWalletSecret,
  type WalletMeta,
} from './storage';

const SUN_PER_TRX = 1_000_000;
const DEFAULT_TRC20_FEE_LIMIT_SUN = 100_000_000;

export type SendAssetTransferInput = {
  tokenId: string;
  toAddress: string;
  amount: string;
  feeLimitSun?: number;
};

export type SendAssetTransferResult = {
  txId: string;
  explorerUrl: string;
  receipt: unknown;
};

function getTrongridHeader() {
  const apiKey = TRONGRID_API_KEYS.find((item) => String(item || '').trim());
  return apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {};
}

function createTronWeb(privateKey?: string) {
  return new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: getTrongridHeader(),
    privateKey,
  });
}

function normalizeAddress(value: string) {
  return String(value || '').trim();
}

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeAddress(value));
}

function normalizeAmountInput(value: string) {
  return String(value || '')
    .replace(',', '.')
    .trim();
}

function decimalToRaw(amount: string, decimals: number) {
  const safe = normalizeAmountInput(amount);

  if (!/^\d+(\.\d+)?$/.test(safe)) {
    throw new Error('Enter a valid amount.');
  }

  const [wholePart, fractionPart = ''] = safe.split('.');

  if (fractionPart.length > decimals) {
    throw new Error(`Too many decimal places. Max allowed: ${decimals}.`);
  }

  const paddedFraction = fractionPart.padEnd(decimals, '0');
  const normalized = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '');

  return normalized || '0';
}

function rawToDecimalString(raw: string, decimals: number) {
  const safeRaw = String(raw || '0').replace(/\D/g, '') || '0';

  if (decimals <= 0) {
    return safeRaw;
  }

  const padded = safeRaw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

function compareRawAmounts(left: string, right: string) {
  const a = String(left || '0').replace(/^0+/, '') || '0';
  const b = String(right || '0').replace(/^0+/, '') || '0';

  if (a.length !== b.length) {
    return a.length > b.length ? 1 : -1;
  }

  if (a === b) {
    return 0;
  }

  return a > b ? 1 : -1;
}

async function getSigningContext(): Promise<{
  wallet: WalletMeta;
  privateKey: string;
}> {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Watch-only wallet cannot sign transactions.');
  }

  const secret = await getWalletSecret(wallet.id);
  const privateKey = String(secret?.privateKey || '').trim();

  if (!privateKey) {
    throw new Error('Private key not found for this wallet.');
  }

  return {
    wallet,
    privateKey,
  };
}

export async function sendAssetTransfer(
  input: SendAssetTransferInput
): Promise<SendAssetTransferResult> {
  const tokenId = String(input.tokenId || '').trim() || TRX_TOKEN_ID;
  const toAddress = normalizeAddress(input.toAddress);
  const amount = normalizeAmountInput(input.amount);
  const feeLimitSun =
    typeof input.feeLimitSun === 'number' && Number.isFinite(input.feeLimitSun)
      ? Math.max(1_000_000, Math.floor(input.feeLimitSun))
      : DEFAULT_TRC20_FEE_LIMIT_SUN;

  if (!isValidTronAddress(toAddress)) {
    throw new Error('Enter a valid TRON address.');
  }

  if (!amount) {
    throw new Error('Amount is required.');
  }

  const { wallet, privateKey } = await getSigningContext();
  const tronWeb = createTronWeb(privateKey);

  if (tokenId === TRX_TOKEN_ID) {
    const amountRaw = decimalToRaw(amount, 6);

    if (compareRawAmounts(amountRaw, '0') <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const currentTrx = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);

    if (compareRawAmounts(amountRaw, currentTrx.balanceRaw) > 0) {
      throw new Error('Insufficient TRX balance.');
    }

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      Number(amountRaw),
      wallet.address
    );

    const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
    const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

    const txId =
      String(
        (receipt as any)?.txid ||
        (receipt as any)?.txID ||
        (receipt as any)?.transaction?.txID ||
        signedTx?.txID ||
        ''
      ).trim();

    if (!(receipt as any)?.result || !txId) {
      throw new Error(
        String((receipt as any)?.code || (receipt as any)?.message || 'Failed to broadcast TRX transaction.')
      );
    }

    return {
      txId,
      explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
      receipt,
    };
  }

  const token = await getTokenDetails(wallet.address, tokenId, false, wallet.id);
  const amountRaw = decimalToRaw(amount, token.decimals);

  if (compareRawAmounts(amountRaw, '0') <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (compareRawAmounts(amountRaw, token.balanceRaw) > 0) {
    throw new Error(`Insufficient ${token.symbol} balance.`);
  }

  const parameters = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amountRaw },
  ];

  const triggerResult = await tronWeb.transactionBuilder.triggerSmartContract(
    token.address,
    'transfer(address,uint256)',
    {
      feeLimit: feeLimitSun,
      callValue: 0,
    },
    parameters,
    wallet.address
  );

  const unsignedTx =
    (triggerResult as any)?.transaction ||
    (triggerResult as any)?.transaction?.transaction;

  if (!unsignedTx) {
    throw new Error('Failed to build TRC20 transfer transaction.');
  }

  const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
  const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

  const txId =
    String(
      (receipt as any)?.txid ||
      (receipt as any)?.txID ||
      (receipt as any)?.transaction?.txID ||
      signedTx?.txID ||
      ''
    ).trim();

  if (!(receipt as any)?.result || !txId) {
    throw new Error(
      String((receipt as any)?.code || (receipt as any)?.message || 'Failed to broadcast token transaction.')
    );
  }

  return {
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
    receipt,
  };
}

export async function getSendAssetDraft(tokenId?: string) {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  const safeTokenId = String(tokenId || '').trim() || TRX_TOKEN_ID;
  const token = await getTokenDetails(wallet.address, safeTokenId, false, wallet.id);

  return {
    wallet,
    token,
    spendableAmount: rawToDecimalString(token.balanceRaw, token.decimals),
  };
}
