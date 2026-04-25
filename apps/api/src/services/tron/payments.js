const { tronWeb } = require('./client');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase58Address(value) {
  if (!value) return '';

  try {
    return tronWeb.address.fromHex(String(value));
  } catch (_) {
    return '';
  }
}

function isTransactionNotFoundError(error) {
  const message = String(error?.message || error || '').toLowerCase();

  return (
    message.includes('transaction not found') ||
    message.includes('txn not found') ||
    message.includes('does not exist')
  );
}

async function readTrxPayment(txid, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 6));
  const delayMs = Math.max(250, Number(options.delayMs || 1500));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const tx = await tronWeb.trx.getTransaction(txid);
      const info = await tronWeb.trx.getTransactionInfo(txid).catch(() => null);
      const contract = tx?.raw_data?.contract?.[0];
      const value = contract?.parameter?.value || {};

      if (contract?.type !== 'TransferContract') {
        throw new Error('Payment transaction is not a TRX transfer');
      }

      if (info?.receipt?.result && info.receipt.result !== 'SUCCESS') {
        throw new Error('Payment transaction was not successful');
      }

      const owner = toBase58Address(value.owner_address);
      const recipient = toBase58Address(value.to_address);
      const amountSun = String(value.amount || '0');

      if (!owner || !recipient || !/^\d+$/.test(amountSun)) {
        throw new Error('Payment transaction is invalid');
      }

      return {
        txid,
        owner,
        recipient,
        amountSun
      };
    } catch (error) {
      lastError = error;

      if (!isTransactionNotFoundError(error) || attempt >= attempts) {
        break;
      }

      await wait(delayMs);
    }
  }

  throw lastError || new Error('Transaction not found');
}

module.exports = {
  readTrxPayment,
  toBase58Address
};
