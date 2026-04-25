const crypto = require('crypto');
const { fetch } = require('undici');
const TronWebPackage = require('tronweb');
const env = require('../../config/env');
const {
  PLATFORM_TELEGRAM_BIT,
  createTelegramClaimSession,
  getTelegramAirdropGuardStatus,
  getTelegramAirdropOverview,
  getTelegramClaimSessionByToken,
  listQueuedTelegramClaims,
  queueTelegramClaim,
  updateTelegramClaim,
  updateTelegramClaimSession,
  upsertTelegramAccountLink
} = require('./telegramClaims');

const TronWeb = TronWebPackage.TronWeb || TronWebPackage.default || TronWebPackage;

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const SESSION_CALLBACK_PREFIX = 'airdrop_verify:';
const CLAIM_QUEUE_LIMIT = 5;
const CLAIM_DECIMALS = 6;

let claimDrainPromise = Promise.resolve();
let webhookEnsurePromise = null;
let lastWebhookEnsureAt = 0;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeUsername(value) {
  return normalizeValue(value).replace(/^@+/, '');
}

function normalizeTxid(value) {
  return normalizeValue(value).toLowerCase();
}

function getBotToken() {
  return normalizeValue(env.TELEGRAM_BOT_TOKEN);
}

function getBotUsername() {
  return normalizeUsername(env.TELEGRAM_BOT_USERNAME);
}

function buildBotApiUrl(method) {
  const token = getBotToken();

  if (!token) {
    const error = new Error('TELEGRAM_BOT_TOKEN is not configured');
    error.status = 503;
    throw error;
  }

  return `${TELEGRAM_API_BASE_URL}/bot${token}/${method}`;
}

function getExpectedWebhookUrl() {
  const baseUrl = normalizeValue(env.TELEGRAM_WEBHOOK_BASE_URL);
  const secret = normalizeValue(env.TELEGRAM_WEBHOOK_SECRET);

  if (!baseUrl || !secret) {
    return '';
  }

  return `${baseUrl.replace(/\/+$/, '')}/airdrop/telegram/webhook/${encodeURIComponent(secret)}`;
}

async function telegramApi(method, body) {
  const response = await fetch(buildBotApiUrl(method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.description || `Telegram ${method} failed`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload?.result;
}

function createAirdropTronWeb() {
  const privateKey =
    normalizeValue(env.AIRDROP_CONTROL_WALLET_PRIVATE_KEY) ||
    normalizeValue(env.OPERATOR_WALLET_PRIVATE_KEY) ||
    normalizeValue(env.TRON_PRIVATE_KEY);

  if (!privateKey) {
    const error = new Error('Airdrop control private key is not configured');
    error.status = 503;
    throw error;
  }

  const apiKey =
    normalizeValue(env.TRONGRID_API_KEY) ||
    normalizeValue(env.TRONGRID_API_KEY_1) ||
    normalizeValue(env.TRONGRID_API_KEY_2) ||
    normalizeValue(env.TRONGRID_API_KEY_3);

  return new TronWeb({
    fullHost: env.TRON_FULL_HOST,
    privateKey,
    headers: apiKey
      ? {
          'TRON-PRO-API-KEY': apiKey
        }
      : undefined
  });
}

function getAirdropSenderAddress() {
  const configuredWallet = normalizeValue(env.AIRDROP_CONTROL_WALLET);
  if (configuredWallet) {
    return configuredWallet;
  }

  const tronWeb = createAirdropTronWeb();
  const privateKey =
    normalizeValue(env.AIRDROP_CONTROL_WALLET_PRIVATE_KEY) ||
    normalizeValue(env.OPERATOR_WALLET_PRIVATE_KEY) ||
    normalizeValue(env.TRON_PRIVATE_KEY);

  return tronWeb.address.fromPrivateKey(privateKey);
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatReward(amount) {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: CLAIM_DECIMALS,
    maximumFractionDigits: CLAIM_DECIMALS
  });
}

function buildTelegramStartLinks(sessionToken) {
  const username = getBotUsername();
  const safeToken = normalizeValue(sessionToken);

  if (!username || !safeToken) {
    return {
      httpsUrl: '',
      appUrl: ''
    };
  }

  return {
    httpsUrl: `https://t.me/${username}?start=${encodeURIComponent(safeToken)}`,
    appUrl: `tg://resolve?domain=${encodeURIComponent(username)}&start=${encodeURIComponent(
      safeToken
    )}`
  };
}

function buildWalletChallenge({ walletAddress, sessionToken, expiresAt }) {
  return [
    '4TEEN Telegram Airdrop',
    `Wallet: ${normalizeValue(walletAddress)}`,
    `Session: ${normalizeValue(sessionToken)}`,
    `ExpiresAt: ${new Date(expiresAt).toISOString()}`,
    'Purpose: link wallet to Telegram and request a Telegram airdrop claim.'
  ].join('\n');
}

function buildTelegramVerifyKeyboard(sessionToken) {
  const safeToken = normalizeValue(sessionToken);

  return {
    inline_keyboard: [
      [
        { text: 'Join Community', url: normalizeValue(env.TELEGRAM_GROUP_URL) },
        { text: 'Join Channel', url: normalizeValue(env.TELEGRAM_CHANNEL_URL) }
      ],
      [{ text: 'CHECK AGAIN', callback_data: `${SESSION_CALLBACK_PREFIX}${safeToken}` }]
    ]
  };
}

function buildTelegramProgressMessage() {
  return [
    '4TEEN Telegram Airdrop',
    '',
    'Checking wallet session...',
    'Checking previous claim...',
    'Checking channel subscription...',
    'Checking community subscription...'
  ].join('\n');
}

function buildTelegramStatusMessage({ session, membership, guard, claim, link, resourceState }) {
  const lines = ['4TEEN Telegram Airdrop', ''];

  lines.push(`Wallet: ${session.wallet_address}`);

  if (link?.telegram_username) {
    lines.push(`Telegram: @${link.telegram_username}`);
  } else if (session.telegram_user_id) {
    lines.push(`Telegram ID: ${session.telegram_user_id}`);
  }

  lines.push('');

  if (guard.walletBlockedByLegacyClaim || guard.telegramBlockedByLegacyClaim) {
    lines.push('✓ Previous claim check: already used in the legacy bot flow');
    if (guard.claimedTxid) {
      lines.push(`TX: ${guard.claimedTxid}`);
    }
    lines.push('');
    lines.push('Reward is already exhausted for this Telegram claim.');
    return lines.join('\n');
  }

  if (claim?.status === 'sent' && claim?.txid) {
    lines.push('✓ Previous claim check: reward already received');
    lines.push(`✓ Reward sent: ${formatReward(claim.reward_amount)} 4TEEN`);
    lines.push(`TX: ${claim.txid}`);
    return lines.join('\n');
  }

  if (guard.telegramLinked && guard.telegramLinkedWalletAddress !== session.wallet_address) {
    lines.push('✓ Previous claim check: clear');
    lines.push('✕ Telegram account link: already linked to another wallet');
    lines.push('');
    lines.push('Use another Telegram account or unlink the old one first.');
    return lines.join('\n');
  }

  if (guard.walletLinked && guard.walletLinkedTelegramUserId !== session.telegram_user_id) {
    lines.push('✓ Previous claim check: clear');
    lines.push('✕ Wallet link: already linked to another Telegram account');
    lines.push('');
    lines.push('Use the linked Telegram account or rebind later.');
    return lines.join('\n');
  }

  lines.push(
    claim?.status === 'queued' || claim?.status === 'failed'
      ? '✓ Previous claim check: claim record exists'
      : '✓ Previous claim check: clear'
  );

  if (membership) {
    lines.push(
      `${membership.channelOk ? '✓' : '✕'} Channel subscription: ${
        membership.channelOk ? 'subscribed' : 'not subscribed'
      }`
    );
    lines.push(
      `${membership.groupOk ? '✓' : '✕'} Community subscription: ${
        membership.groupOk ? 'subscribed' : 'not subscribed'
      }`
    );
  }

  if (!membership?.ready) {
    lines.push('');
    lines.push('Subscribe to the missing Telegram chats, then tap CHECK AGAIN.');
    return lines.join('\n');
  }

  lines.push('✓ Wallet link: verified');

  if (claim?.status === 'queued') {
    lines.push(`✓ Claim status: queued for ${formatReward(claim.reward_amount)} 4TEEN`);
    if (resourceState && !resourceState.hasEnough) {
      lines.push('• Waiting for airdrop wallet resources before send.');
    } else {
      lines.push('• Waiting for on-chain send.');
    }
    return lines.join('\n');
  }

  if (claim?.status === 'failed') {
    lines.push('✕ Claim send: failed in the previous attempt');
    if (claim.failure_reason) {
      lines.push(`Reason: ${claim.failure_reason}`);
    }
    lines.push('');
    lines.push('Tap CHECK AGAIN to retry the claim flow.');
    return lines.join('\n');
  }

  lines.push('✓ Claim status: accepted');
  lines.push('• Preparing the airdrop transaction now.');

  return lines.join('\n');
}

function getRandomRewardAmount() {
  const minRaw = Math.round(Number(env.TELEGRAM_AIRDROP_MIN_REWARD) * 10 ** CLAIM_DECIMALS);
  const maxRaw = Math.round(Number(env.TELEGRAM_AIRDROP_MAX_REWARD) * 10 ** CLAIM_DECIMALS);
  const rewardRaw = Math.floor(Math.random() * (maxRaw - minRaw + 1)) + minRaw;
  return rewardRaw / 10 ** CLAIM_DECIMALS;
}

function toRawReward(amount) {
  return Math.round(Number(amount || 0) * 10 ** CLAIM_DECIMALS);
}

async function getAirdropWalletResources() {
  const tronWeb = createAirdropTronWeb();
  const walletAddress = getAirdropSenderAddress();
  const resources = await tronWeb.trx.getAccountResources(walletAddress);

  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);
  const energyAvailable = Math.max(0, energyLimit - energyUsed);

  const freeNetLimit = Number(resources?.freeNetLimit || 0);
  const freeNetUsed = Number(resources?.freeNetUsed || 0);
  const freeBandwidth = Math.max(0, freeNetLimit - freeNetUsed);

  const netLimit = Number(resources?.NetLimit || 0);
  const netUsed = Number(resources?.NetUsed || 0);
  const stakedBandwidth = Math.max(0, netLimit - netUsed);
  const bandwidthAvailable = freeBandwidth + stakedBandwidth;

  return {
    walletAddress,
    energyAvailable,
    bandwidthAvailable
  };
}

async function hasEnoughAirdropResources() {
  const resources = await getAirdropWalletResources();
  const energyAfter = resources.energyAvailable - Number(env.TELEGRAM_AIRDROP_REQUIRED_ENERGY || 0);
  const bandwidthAfter =
    resources.bandwidthAvailable - Number(env.TELEGRAM_AIRDROP_REQUIRED_BANDWIDTH || 0);

  return {
    ...resources,
    energyAfter,
    bandwidthAfter,
    hasEnough:
      energyAfter >= Number(env.TELEGRAM_AIRDROP_MIN_ENERGY_FLOOR || 0) &&
      bandwidthAfter >= Number(env.TELEGRAM_AIRDROP_MIN_BANDWIDTH_FLOOR || 0)
  };
}

async function sendAirdropTransaction(walletAddress, rewardAmount) {
  const tronWeb = createAirdropTronWeb();
  const contract = await tronWeb.contract().at(env.AIRDROP_VAULT_CONTRACT);
  const txid = await contract
    .airdrop(walletAddress, toRawReward(rewardAmount), PLATFORM_TELEGRAM_BIT)
    .send();

  return normalizeTxid(txid);
}

async function processQueuedTelegramClaim(claim) {
  const resourceState = await hasEnoughAirdropResources();

  if (!resourceState.hasEnough) {
    return updateTelegramClaim({
      claimId: claim.id,
      status: 'queued',
      metaPatch: {
        waitingResources: true,
        resourceState,
        lastAttemptAt: new Date().toISOString()
      }
    });
  }

  try {
    const txid = await sendAirdropTransaction(claim.wallet_address, claim.reward_amount);

    return updateTelegramClaim({
      claimId: claim.id,
      status: 'sent',
      txid,
      metaPatch: {
        waitingResources: false,
        lastAttemptAt: new Date().toISOString(),
        resourceState
      }
    });
  } catch (error) {
    return updateTelegramClaim({
      claimId: claim.id,
      status: 'failed',
      failureReason: error instanceof Error ? error.message : 'Airdrop send failed',
      metaPatch: {
        lastAttemptAt: new Date().toISOString()
      }
    });
  }
}

async function drainTelegramClaimQueue() {
  const queuedClaims = await listQueuedTelegramClaims(CLAIM_QUEUE_LIMIT);

  for (const claim of queuedClaims) {
    await processQueuedTelegramClaim(claim);
  }

  return queuedClaims.length;
}

function enqueueTelegramClaimDrain() {
  const nextRun = claimDrainPromise.then(() => drainTelegramClaimQueue());
  claimDrainPromise = nextRun.catch(() => 0);
  return nextRun;
}

async function getTelegramMembership(telegramUserId) {
  const userId = normalizeValue(telegramUserId);
  const groupId = normalizeValue(env.TELEGRAM_GROUP_ID);
  const channelId = normalizeValue(env.TELEGRAM_CHANNEL_ID);

  async function checkChat(chatId) {
    if (!chatId || !userId) return false;

    try {
      const member = await telegramApi('getChatMember', {
        chat_id: chatId,
        user_id: userId
      });

      return ['member', 'administrator', 'creator'].includes(
        normalizeValue(member?.status).toLowerCase()
      );
    } catch {
      return false;
    }
  }

  const [groupOk, channelOk] = await Promise.all([checkChat(groupId), checkChat(channelId)]);

  return {
    groupOk,
    channelOk,
    ready: groupOk && channelOk
  };
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup) {
  if (!chatId || !messageId) {
    return null;
  }

  return telegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup || undefined,
    disable_web_page_preview: true
  });
}

async function answerTelegramCallback(callbackQueryId, text) {
  if (!callbackQueryId) return;

  try {
    await telegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text ? String(text) : undefined,
      show_alert: false
    });
  } catch {}
}

async function ensureTelegramWebhook() {
  const expectedUrl = getExpectedWebhookUrl();

  if (!expectedUrl) {
    return null;
  }

  if (Date.now() - lastWebhookEnsureAt < 5 * 60 * 1000 && !webhookEnsurePromise) {
    return { ok: true, url: expectedUrl, cached: true };
  }

  if (webhookEnsurePromise) {
    return webhookEnsurePromise;
  }

  webhookEnsurePromise = (async () => {
    try {
      const webhookInfo = await telegramApi('getWebhookInfo', {});
      const currentUrl = normalizeValue(webhookInfo?.url);

      if (currentUrl === expectedUrl) {
        lastWebhookEnsureAt = Date.now();
        return {
          ok: true,
          url: expectedUrl,
          synced: true
        };
      }

      const synced = await syncTelegramWebhook();
      lastWebhookEnsureAt = Date.now();
      return synced;
    } finally {
      webhookEnsurePromise = null;
    }
  })();

  return webhookEnsurePromise;
}

async function prepareTelegramSession(walletAddress) {
  await ensureTelegramWebhook();
  const sessionToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const challenge = buildWalletChallenge({
    walletAddress,
    sessionToken,
    expiresAt
  });

  await createTelegramClaimSession({
    walletAddress,
    sessionToken,
    challenge,
    expiresAt
  });

  return {
    walletAddress,
    sessionToken,
    challenge,
    expiresAt: expiresAt.toISOString()
  };
}

async function verifyTelegramSession({ walletAddress, sessionToken, signature }) {
  const safeWallet = normalizeValue(walletAddress);
  const safeSignature = normalizeValue(signature);
  const session = await getTelegramClaimSessionByToken(sessionToken);

  if (!session) {
    const error = new Error('Telegram session not found');
    error.status = 404;
    throw error;
  }

  if (session.wallet_address !== safeWallet) {
    const error = new Error('Wallet does not match session');
    error.status = 409;
    throw error;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const error = new Error('Telegram session expired');
    error.status = 410;
    throw error;
  }

  const challenge = normalizeValue(session.payload_json?.challenge);

  if (!challenge || !safeSignature) {
    const error = new Error('Telegram session challenge or signature is missing');
    error.status = 400;
    throw error;
  }

  const verifier = createAirdropTronWeb();
  const verifiedAddress = await verifier.trx.verifyMessageV2(challenge, safeSignature, safeWallet);

  if (normalizeValue(verifiedAddress) !== safeWallet) {
    const error = new Error('Wallet signature verification failed');
    error.status = 401;
    throw error;
  }

  const updatedSession = await updateTelegramClaimSession({
    sessionId: session.id,
    status: 'wallet_verified',
    payloadPatch: {
      walletVerifiedAt: new Date().toISOString()
    }
  });

  return {
    session: updatedSession,
    links: buildTelegramStartLinks(sessionToken)
  };
}

async function processTelegramMembershipAndClaim({
  sessionToken,
  telegramUserId,
  telegramUsername,
  telegramChatId
}) {
  const session = await getTelegramClaimSessionByToken(sessionToken);

  if (!session) {
    return {
      ok: false,
      message: 'Session not found. Return to the wallet and start Telegram again.'
    };
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      message: 'Session expired. Return to the wallet and create a new Telegram session.'
    };
  }

  if (session.status === 'pending') {
    return {
      ok: false,
      message: 'Wallet signature is missing. Return to the wallet first.'
    };
  }

  const safeTelegramUserId = normalizeValue(telegramUserId);
  const guard = await getTelegramAirdropGuardStatus({
    walletAddress: session.wallet_address,
    telegramUserId: safeTelegramUserId
  });
  const membership = await getTelegramMembership(safeTelegramUserId);

  await updateTelegramClaimSession({
    sessionId: session.id,
    status: membership.ready ? 'membership_verified' : 'awaiting_membership',
    telegramUserId: safeTelegramUserId,
    payloadPatch: {
      telegramChatId: normalizeValue(telegramChatId) || null,
      telegramUsername: normalizeUsername(telegramUsername) || null,
      membership,
      lastTelegramCheckAt: new Date().toISOString()
    }
  });

  if (!membership.ready) {
    return {
      ok: true,
      message: buildTelegramStatusMessage({
        session: {
          ...session,
          telegram_user_id: safeTelegramUserId
        },
        membership,
        guard,
        claim: null,
        link: null
      }),
      replyMarkup: buildTelegramVerifyKeyboard(sessionToken)
    };
  }

  if (guard.telegramLinked && guard.telegramLinkedWalletAddress !== session.wallet_address) {
    return {
      ok: true,
      message: buildTelegramStatusMessage({
        session: {
          ...session,
          telegram_user_id: safeTelegramUserId
        },
        membership,
        guard,
        claim: null,
        link: null
      })
    };
  }

  if (guard.walletLinked && guard.walletLinkedTelegramUserId !== safeTelegramUserId) {
    return {
      ok: true,
      message: buildTelegramStatusMessage({
        session: {
          ...session,
          telegram_user_id: safeTelegramUserId
        },
        membership,
        guard,
        claim: null,
        link: null
      })
    };
  }

  const link = await upsertTelegramAccountLink({
    walletAddress: session.wallet_address,
    telegramUserId: safeTelegramUserId,
    telegramUsername,
    telegramChatId,
    legacyClaimed:
      guard.walletBlockedByLegacyClaim || guard.telegramBlockedByLegacyClaim,
    notes: 'wallet-signed telegram bind'
  }).catch((error) => {
    if (error?.details) {
      return null;
    }

    throw error;
  });

  const overviewAfterLink = await getTelegramAirdropOverview({
    walletAddress: session.wallet_address
  });

  if (
    overviewAfterLink.guard.walletBlockedByLegacyClaim ||
    overviewAfterLink.guard.telegramBlockedByLegacyClaim ||
    overviewAfterLink.claim?.status === 'sent'
  ) {
    return {
      ok: true,
      message: buildTelegramStatusMessage({
        session: {
          ...session,
          telegram_user_id: safeTelegramUserId
        },
        membership,
        guard: overviewAfterLink.guard,
        claim: overviewAfterLink.claim,
        link: overviewAfterLink.link || link
      })
    };
  }

  let claim = overviewAfterLink.claim;

  if (!claim) {
    claim = await queueTelegramClaim({
      walletAddress: session.wallet_address,
      telegramUserId: safeTelegramUserId,
      rewardAmount: getRandomRewardAmount(),
      meta: {
        source: 'wallet_telegram_session',
        sessionId: session.id,
        telegramUsername: normalizeUsername(telegramUsername) || null
      }
    });
  }

  await updateTelegramClaimSession({
    sessionId: session.id,
    status: 'claim_queued',
    telegramUserId: safeTelegramUserId,
    consumed: true,
    payloadPatch: {
      claimId: claim?.id || null
    }
  });

  await enqueueTelegramClaimDrain();

  const finalOverview = await getTelegramAirdropOverview({
    walletAddress: session.wallet_address
  });
  const resourceState =
    finalOverview.claim?.status === 'queued' ? await hasEnoughAirdropResources().catch(() => null) : null;

  return {
    ok: true,
    message: buildTelegramStatusMessage({
      session: {
        ...session,
        telegram_user_id: safeTelegramUserId
      },
      membership,
      guard: finalOverview.guard,
      claim: finalOverview.claim,
      link: finalOverview.link,
      resourceState
    })
  };
}

async function handleTelegramWebhookUpdate(update) {
  const message = update?.message;
  const callbackQuery = update?.callback_query;

  if (message?.text && String(message.text).startsWith('/start')) {
    const [, rawToken = ''] = String(message.text).trim().split(/\s+/, 2);
    const token = normalizeValue(rawToken);
    const progressMessage = await sendTelegramMessage(
      message.chat?.id,
      buildTelegramProgressMessage()
    ).catch(() => null);

    const result = await processTelegramMembershipAndClaim({
      sessionToken: token,
      telegramUserId: message.from?.id,
      telegramUsername: message.from?.username,
      telegramChatId: message.chat?.id
    });

    const replyMarkup = result.replyMarkup || buildTelegramVerifyKeyboard(token);

    try {
      if (progressMessage?.message_id) {
        await editTelegramMessage(
          message.chat?.id,
          progressMessage.message_id,
          result.message,
          replyMarkup
        );
      } else {
        await sendTelegramMessage(message.chat?.id, result.message, replyMarkup);
      }
    } catch (error) {
      console.error('Telegram start response failed:', error);
    }

    return result;
  }

  if (callbackQuery?.data && String(callbackQuery.data).startsWith(SESSION_CALLBACK_PREFIX)) {
    const token = normalizeValue(String(callbackQuery.data).slice(SESSION_CALLBACK_PREFIX.length));
    await answerTelegramCallback(callbackQuery.id, 'Checking Telegram membership...');

    const result = await processTelegramMembershipAndClaim({
      sessionToken: token,
      telegramUserId: callbackQuery.from?.id,
      telegramUsername: callbackQuery.from?.username,
      telegramChatId: callbackQuery.message?.chat?.id
    });

    try {
      const replyMarkup = result.replyMarkup || buildTelegramVerifyKeyboard(token);

      if (callbackQuery.message?.message_id) {
        await editTelegramMessage(
          callbackQuery.message?.chat?.id,
          callbackQuery.message.message_id,
          result.message,
          replyMarkup
        );
      } else {
        await sendTelegramMessage(callbackQuery.message?.chat?.id, result.message, replyMarkup);
      }
    } catch (error) {
      console.error('Telegram callback response failed:', error);
    }

    return result;
  }

  return {
    ok: true,
    ignored: true
  };
}

async function syncTelegramWebhook() {
  const baseUrl = normalizeValue(env.TELEGRAM_WEBHOOK_BASE_URL);
  const secret = normalizeValue(env.TELEGRAM_WEBHOOK_SECRET);

  if (!baseUrl || !secret) {
    const error = new Error('TELEGRAM_WEBHOOK_BASE_URL or TELEGRAM_WEBHOOK_SECRET is missing');
    error.status = 400;
    throw error;
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/airdrop/telegram/webhook/${encodeURIComponent(
    secret
  )}`;

  await telegramApi('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false
  });

  return {
    ok: true,
    url
  };
}

module.exports = {
  buildTelegramStartLinks,
  enqueueTelegramClaimDrain,
  getAirdropWalletResources,
  getTelegramMembership,
  handleTelegramWebhookUpdate,
  hasEnoughAirdropResources,
  prepareTelegramSession,
  syncTelegramWebhook,
  verifyTelegramSession
};
