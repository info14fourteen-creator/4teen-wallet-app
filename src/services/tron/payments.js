const { tronWeb } = require('./client');

function toBase58Address(value) {
  if (!value) return '';

  try {
    return tronWeb.address.fromHex(String(value));
  } catch (_) {
    return '';
  }
}

async function readTrxPayment(txid) {
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
}

module.exports = {
  readTrxPayment,
  toBase58Address
};
