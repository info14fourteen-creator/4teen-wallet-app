import { formatOperationSun } from '../src/services/wallet/operation-fee';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { Image } from 'expo-image';

import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import ApprovalAuthModal from '../src/ui/approval-auth-modal';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { goBackOrReplace } from '../src/ui/safe-back';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { useI18n } from '../src/i18n';
import {
  clearWalletRuntimeCaches,
  prependTokenHistoryCacheItem,
  prependWalletHistoryCacheItem,
  TRX_TOKEN_ID,
} from '../src/services/tron/api';
import {
  estimateAssetTransfer,
  type SendAssetTransferEstimate,
} from '../src/services/wallet/send';
import { sendWithResources } from '../src/services/wallet/resource-transfer';
import { calculateTransferFeeSun } from '../src/services/wallet/transfer-fee';
import { acknowledgeRecordedTransfer, getRecordedTransfer } from '../src/services/wallet/recorded-transfer';
import { getActiveWallet } from '../src/services/wallet/storage';
import {
  getEnergyResaleQuote,
  getPendingEnergyRentalQuote,
  completeEnergyRental,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';
import { rememberRecentRecipient } from '../src/services/recent-recipients';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';
import { useOperationFee } from '../src/services/wallet/use-operation-fee';

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] || '');
  return '';
}

export default function SendConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { t } = useI18n();
  const { setChromeHidden, triggerWalletDataRefresh } = useWalletSession();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const params = useLocalSearchParams<{
    tokenId?: string | string[];
    address?: string | string[];
    amount?: string | string[];
    contactName?: string | string[];
  }>();

  const tokenId = resolveParam(params.tokenId).trim();
  const address = resolveParam(params.address).trim();
  const amount = resolveParam(params.amount).trim();
  const contactName = resolveParam(params.contactName).trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [estimate, setEstimate] = useState<SendAssetTransferEstimate | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeEntryOpen, setPasscodeEntryOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState(t('Biometrics'));
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [energyQuote, setEnergyQuote] = useState<EnergyResaleQuote | null>(null);
  const [energyQuoteLoading, setEnergyQuoteLoading] = useState(false);
  const operationFee = useOperationFee({ wallet: estimate && !estimate.token.isNative ? estimate.wallet.address : undefined,
    purpose: 'send_transfer', burnSun: estimate?.resources.estimatedBurnSun, resources: estimate?.resources,
    quote: energyQuote, loading: energyQuoteLoading });
  const [transactionFeeSun, setTransactionFeeSun] = useState<number | null>(null);
  const energyRenting = sending;
  const sendLock = useRef(false);
  const approvedFeeRef = useRef<number | null>(null);
  const [approvalStatusTitle, setApprovalStatusTitle] = useState('');
  const [approvalStatusMessage, setApprovalStatusMessage] = useState('');
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'send' | 'rent'>('send');
  const burnWarningShownRef = useRef(false);
  const preserveNoticeOnExitRef = useRef(false);
  const canUseBiometrics = biometricAvailable && biometricsEnabled;

  useChromeLoading(loading || refreshing);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      if (!tokenId || !address || !amount) {
        throw new Error(
          t('Send request is incomplete. Go back and enter address and amount again.')
        );
      }

      const wallet = await getActiveWallet();
      const pending = wallet ? await getRecordedTransfer(`send:${wallet.address}`) : null;
      if (pending) {
        if (pending.identity !== JSON.stringify([wallet!.address, tokenId, address, amount]) || !pending.context) {
          throw new Error(`A previous transfer needs confirmation: ${pending.txId}`);
        }
        setEstimate(pending.context as SendAssetTransferEstimate);
        return;
      }
      const nextEstimate = await estimateAssetTransfer({
        tokenId,
        toAddress: address,
        amount,
      });

      setEstimate(nextEstimate);
    } catch (error) {
      console.warn(error);
      setEstimate(null);
      setErrorText(error instanceof Error ? error.message : t('Failed to build send confirmation.'));
    } finally {
      setLoading(false);
    }
  }, [address, amount, t, tokenId]);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricsEnabled(enabled);
      setBiometricAvailable(enabled && compatible && enrolled);

      if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel(t('Face ID'));
        return;
      }

      if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel(t('Fingerprint'));
        return;
      }

      setBiometricLabel(t('Biometrics'));
    } catch (error) {
      console.warn(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricLabel(t('Biometrics'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBiometricsState();
  }, [loadBiometricsState]);

  useEffect(() => {
    if (!estimate) return;

    if (!estimate.trxCoverage.canCoverBurn && estimate.resources.energyShortfall === 0 && estimate.resources.bandwidthShortfall === 0) {
      if (burnWarningShownRef.current) return;

      burnWarningShownRef.current = true;
      notice.showErrorNotice(
        t('Not enough TRX. Top up at least {{amount}} TRX first.', {
          amount: formatTrxFromSunAmount(estimate.trxCoverage.missingTrxSun),
        }),
        3200
      );
      return;
    }

    burnWarningShownRef.current = false;
    notice.hideNotice();
  }, [estimate, notice, t]);

  useEffect(() => {
    return () => {
      burnWarningShownRef.current = false;
      setChromeHidden(false);
      if (!preserveNoticeOnExitRef.current) {
        notice.hideNotice();
      }
      preserveNoticeOnExitRef.current = false;
    };
  }, [notice, setChromeHidden]);

  useEffect(() => {
    setChromeHidden(passcodeOpen);
  }, [passcodeOpen, setChromeHidden]);

  const canRentEnergyForSend = Boolean(
    estimate && !estimate.token.isNative &&
      (estimate.resources.energyShortfall > 0 || estimate.resources.bandwidthShortfall > 0)
  );
  const isApproveDisabled = sending || !estimate || energyQuoteLoading || transactionFeeSun === null ||
    (!estimate.token.isNative && !operationFee.plan);
  const feeText = estimate?.token.isNative
    ? (transactionFeeSun === null ? t('Calculating...') : `${formatTrxFromSunAmount(transactionFeeSun)} TRX`)
    : operationFee.plan
      ? `${formatOperationSun(operationFee.plan.feeSun)} TRX (${t('no more than {{amount}} TRX', { amount: formatOperationSun(operationFee.plan.maxFeeSun) })})`
      : t('Calculating...');
  const approvalProcessing = !passcodeOpen && (sending || energyRenting);

  useEffect(() => {
    let cancelled = false;

    if (!estimate || estimate.wallet.kind === 'watch-only') {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      return;
    }

    if (estimate.token.isNative) {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      setTransactionFeeSun(estimate.resources.estimatedBurnSun);
      return;
    }

    setEnergyQuoteLoading(true);
    setTransactionFeeSun(null);
    getPendingEnergyRentalQuote('send_transfer', estimate.wallet.address).then(pending => pending || (canRentEnergyForSend ? getEnergyResaleQuote({
      purpose: 'send_transfer',
      wallet: estimate.wallet.address,
      requiredEnergy: estimate.resources.energyShortfall,
      requiredBandwidth:
        Math.max(estimate.resources.bandwidthShortfall, Math.ceil(
          // Reserve bandwidth for the fee payment before the original transfer.
          estimate.resources.estimatedBandwidth + 400 - getAvailableResource(estimate.resources.available, 'bandwidth')
        )),
    }) : null)).then(async (quote) => {
      const payment = quote ? await estimateAssetTransfer({
        tokenId: TRX_TOKEN_ID, toAddress: quote.paymentAddress, amount: quote.amountTrx,
      }) : null;
      if (payment && payment.wallet.address !== estimate.wallet.address) throw new Error('Active wallet changed.');
      // A contract burn budget includes the sender's conservative bandwidth reserve.
      const burnBudget = !quote && canRentEnergyForSend && !estimate.token.isNative
        ? Math.ceil(estimate.resources.energyShortfall * estimate.resources.energyPriceSun +
            1000 * estimate.resources.bandwidthPriceSun)
        : estimate.resources.estimatedBurnSun;
      const fee = calculateTransferFeeSun(burnBudget, quote, payment?.resources.estimatedBurnSun);
      if (!cancelled) { setEnergyQuote(quote); setTransactionFeeSun(fee); }
    }).catch(() => {
      if (!cancelled) { setEnergyQuote(null); setErrorText(t('Unable to calculate transaction fee. Please try again.')); }
    }).finally(() => {
      if (!cancelled) setEnergyQuoteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canRentEnergyForSend, estimate, t]);

  const handleReject = useCallback(() => {
    if (sending) return;
    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice(t('Transfer rejected by user.'), 2200);
    goBackOrReplace(router, { fallback: '/send' });
  }, [notice, router, sending, t]);

  const performSend = useCallback(async () => {
    if (!estimate || sendLock.current || approvedFeeRef.current === null) return;
    sendLock.current = true;
    let completed = false;

    try {
      setSending(true);
      setApprovalStatusTitle(t('Sending transfer'));
      setApprovalStatusMessage(t('Submitting your transfer to the network...'));

      if (estimate.requestedTokenId !== estimate.token.tokenId) {
        throw new Error(
          t('Selected token changed before approval. Go back and rebuild the transfer.')
        );
      }

      const result = await sendWithResources({
        wallet: estimate.wallet.address,
        quote: energyQuote,
        review: estimate,
        approvedFeeSun: approvedFeeRef.current,
        feeApproval: estimate.token.isNative ? undefined : operationFee.approved.current ?? undefined,
        allowBurnFallback: !energyQuote,
        onProgress: progress => setApprovalStatusMessage(progress.step === 'energy-ready'
          ? t('Sending transfer...') : t('Preparing transfer...')),
        tokenId: estimate.token.tokenId,
        toAddress: estimate.recipientAddress,
        amount: estimate.token.amount,
        ...(estimate.token.recommendedFeeLimitSun > 0
          ? { feeLimitSun: estimate.token.recommendedFeeLimitSun }
          : {}),
      });

      setPasscodeOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
      await rememberRecentRecipient({
        name: contactName || estimate.recipientAddress,
        address: estimate.recipientAddress,
      });
      const optimisticAmountFormatted = estimate.token.amount;
      await prependWalletHistoryCacheItem(estimate.wallet.address, {
        id: `${estimate.token.tokenId}:${result.txId}:SEND:${estimate.token.amountRaw}`,
        txHash: result.txId,
        type: 'OUT',
        displayType: 'SEND',
        amountRaw: estimate.token.amountRaw,
        amountFormatted: optimisticAmountFormatted,
        timestamp: Date.now(),
        from: estimate.wallet.address,
        to: estimate.recipientAddress,
        counterpartyAddress: estimate.recipientAddress,
        counterpartyLabel: contactName || estimate.recipientAddress,
        isKnownContact: Boolean(contactName),
        tronscanUrl: result.explorerUrl,
        tokenId: estimate.token.tokenId,
        tokenName: estimate.token.name,
        tokenSymbol: estimate.token.symbol,
        tokenLogo: estimate.token.logo || undefined,
      });
      await prependTokenHistoryCacheItem(estimate.wallet.address, estimate.token.tokenId, {
        id: result.txId,
        txHash: result.txId,
        type: 'OUT',
        displayType: 'SEND',
        amountRaw: estimate.token.amountRaw,
        amountFormatted: optimisticAmountFormatted,
        timestamp: Date.now(),
        from: estimate.wallet.address,
        to: estimate.recipientAddress,
        counterpartyAddress: estimate.recipientAddress,
        counterpartyLabel: contactName || estimate.recipientAddress,
        isKnownContact: Boolean(contactName),
        tronscanUrl: result.explorerUrl,
      });
      clearWalletRuntimeCaches(estimate.wallet.address);
      triggerWalletDataRefresh();
      await completeEnergyRental('send_transfer', estimate.wallet.address);
      await acknowledgeRecordedTransfer(`send:${estimate.wallet.address}`, result.txId);
      completed = true;
      notice.showSuccessNotice(
        t('{{token}} sent. It will appear in history shortly.', {
          token: estimate.token.symbol,
        }),
        2800
      );
      preserveNoticeOnExitRef.current = true;

      router.replace('/wallet');
    } catch (error) {
      console.warn(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : t('Transaction broadcast failed.'),
        3200
      );
    } finally {
      sendLock.current = completed;
      setSending(false);
      setApprovalStatusTitle('');
      setApprovalStatusMessage('');
    }
  }, [operationFee.approved, contactName, energyQuote, estimate, notice, router, t, triggerWalletDataRefresh]);

  const handlePasscodeSubmit = useCallback(async () => {
    if ((sending || energyRenting) || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError(t('Wrong passcode.'));
        setPasscodeDigits('');
        return;
      }

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');

      await performSend();
    } catch (error) {
      console.warn(error);
      setPasscodeError(t('Failed to verify passcode.'));
      setPasscodeDigits('');
    }
  }, [energyRenting, passcodeDigits, performSend, sending, t]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handlePasscodeDigitPress = useCallback((digit: string) => {
    if (sending || energyRenting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => {
      if (prev.length >= 6) return prev;
      return `${prev}${digit}`;
    });
  }, [energyRenting, sending]);

  const handlePasscodeBackspace = useCallback(() => {
    if (sending || energyRenting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => prev.slice(0, -1));
  }, [energyRenting, sending]);

  const closeApprovalAuth = useCallback(() => {
    setPasscodeOpen(false);
    setPasscodeEntryOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
  }, []);

  const openPasscodeEntry = useCallback(() => {
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
    setPasscodeEntryOpen(true);
  }, []);

  const closePasscodeEntry = useCallback(() => {
    closeApprovalAuth();
  }, [closeApprovalAuth]);

  const handleBiometricApproval = useCallback(async (mode: 'send' | 'rent' = pendingApprovalMode) => {
    if (!canUseBiometrics) {
      openPasscodeEntry();
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:
          mode === 'rent'
            ? t('Confirm Energy Rental')
            : t('Confirm Transaction'),
        fallbackLabel: t('Use Passcode'),
        cancelLabel: t('Cancel'),
      });

      if (!result.success) {
        if (result.error === 'user_fallback') {
          openPasscodeEntry();
        }
        return;
      }

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');

      await performSend();
    } catch (error) {
      console.warn(error);
    }
  }, [canUseBiometrics, openPasscodeEntry, pendingApprovalMode, performSend, t]);

  const openApprovalAuth = useCallback((mode: 'send' | 'rent', preferPasscode = false) => {
    setPendingApprovalMode(mode);
    setPasscodeError('');
    setPasscodeDigits('');

    if (preferPasscode || !canUseBiometrics) {
      setPasscodeEntryOpen(true);
      setPasscodeOpen(true);
      return;
    }

    void handleBiometricApproval(mode);
  }, [canUseBiometrics, handleBiometricApproval]);

  const handleApprove = useCallback(async () => {
    if (isApproveDisabled) return;
    operationFee.approved.current = operationFee.plan;
    approvedFeeRef.current = estimate?.token.isNative ? transactionFeeSun : operationFee.plan?.maxFeeSun ?? null;
    openApprovalAuth(canRentEnergyForSend || energyQuote ? 'rent' : 'send');
  }, [canRentEnergyForSend, energyQuote, isApproveDisabled, openApprovalAuth, transactionFeeSun, operationFee.plan, operationFee.approved, estimate]);

  const handleRefresh = useCallback(async () => {
    if (sending) return;

    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, sending]);

  if (loading && !estimate) {
    return <ScreenLoadingState label={t('Loading send confirmation...')} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay
          visible={refreshing || approvalProcessing}
          title={
            refreshing
              ? t('Refreshing confirmation')
              : approvalStatusTitle || t('Processing')
          }
          message={refreshing ? t('Updating transfer review...') : approvalStatusMessage}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset + 22 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg}
            />
          }
        >
          <ScreenBrow label={t('CONFIRM')} variant="back" />

          {errorText || !estimate ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText || t('Unable to build confirmation.')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                {estimate.token.logo ? (
                  <Image
                    source={{ uri: estimate.token.logo }}
                    style={styles.heroTokenWatermark}
                    contentFit="contain"
                  />
                ) : null}

                <View style={styles.heroTopRow}>
                  <View style={styles.heroWalletBlock}>
                    <Text style={styles.heroWalletName}>{estimate.wallet.name}</Text>
                    <Text style={styles.heroFromLabel}>{t('FROM')}</Text>
                    <Text style={styles.heroFromAddress}>{estimate.wallet.address}</Text>
                  </View>
                </View>

                <View style={styles.heroAmountRow}>
                  <View style={styles.heroAmountBlock}>
                    <Text style={styles.heroAmount}>{estimate.token.amount}</Text>
                  </View>

                  <View style={styles.heroTokenSide}>
                    <Text style={styles.heroBurnSideLabel}>{t('Transaction fee')}</Text>
                    <Text
                      style={[
                        styles.heroBurnSideValue,
                      ]}
                      numberOfLines={3}
                      adjustsFontSizeToFit
                    >
                      {feeText}
                    </Text>
                  </View>
                </View>

                <View style={styles.heroTransferMeta}>
                  <View style={styles.heroAddressCol}>
                    <Text style={styles.heroAddressLabel}>{t('TO')}</Text>
                    {contactName ? <Text style={styles.heroRecipientName}>{contactName}</Text> : null}
                    <Text style={styles.heroRecipientAddress}>{estimate.recipientAddress}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.primaryButton,
                  isApproveDisabled && styles.primaryButtonDisabled,
                ]}
                onPress={() => void handleApprove()}
                disabled={isApproveDisabled}
              >
                {sending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text
                    style={styles.primaryButtonText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {t('APPROVE & SEND')}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>{t('TRANSFER REVIEW')}</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRowFirst}>
                    <Text style={styles.detailLabel}>{t('Asset')}</Text>
                    <Text style={styles.detailValue}>{estimate.token.name}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Amount')}</Text>
                    <Text style={styles.detailValue}>{estimate.token.amountDisplay}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Transaction fee')}</Text>
                    <Text style={styles.detailValueAccent}>
                      {feeText}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('TRX Available')}</Text>
                    <Text style={styles.detailValue}>{estimate.trxCoverage.trxBalanceDisplay}</Text>
                  </View>

                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={handleReject}
                disabled={sending}
              >
                <Text
                  style={styles.secondaryButtonText}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('REJECT')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <ApprovalAuthModal
          visible={passcodeOpen}
          eyebrow={t('Transaction Approval')}
          actionLabel={t('transfer')}
          passcodeError={passcodeError}
          digitsLength={passcodeDigits.length}
          canUseBiometrics={canUseBiometrics}
          biometricLabel={biometricLabel}
          passcodeEntryOpen={passcodeEntryOpen}
          submitting={sending || energyRenting}
          onRequestClose={closeApprovalAuth}
          onOpenPasscode={openPasscodeEntry}
          onClosePasscode={closePasscodeEntry}
          onDigitPress={handlePasscodeDigitPress}
          onBackspacePress={handlePasscodeBackspace}
          onBiometricPress={() => void handleBiometricApproval()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPaddingX,
  },

  scroll: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
  },

  heroCard: {
    marginTop: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
  },

  heroTokenWatermark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 120,
    height: 120,
    opacity: 0.05,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  heroWalletBlock: {
    flex: 1,
  },

  heroWalletName: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },

  heroFromLabel: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.6,
  },

  heroFromAddress: {
    marginTop: 4,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  heroAmountRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },

  heroTokenSide: {
    width: 120,
    maxWidth: '45%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },

  heroBurnSideLabel: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0,
    textAlign: 'right',
  },

  heroBurnSideValue: {
    marginTop: 3,
    color: colors.white,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  heroAmountBlock: {
    flex: 1,
    minHeight: 38,
    justifyContent: 'flex-end',
  },

  heroAmount: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: 'Sora_700Bold',
  },

  heroTransferMeta: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  heroAddressCol: {
    flex: 1,
  },

  heroAddressLabel: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.6,
  },

  heroRecipientName: {
    marginTop: 8,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  heroRecipientAddress: {
    marginTop: 4,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  heroBurnValueRisk: {
    color: colors.red,
  },

  sectionBlock: {
    marginTop: 16,
    gap: 8,
  },
  sectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },

  detailCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
  },

  detailRow: {
    minHeight: 50,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  detailRowFirst: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },

  detailValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  detailValueAccent: {
    flex: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  resourcesInlineRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    gap: 10,
  },

  resourceInlineCol: {
    gap: 6,
  },

  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  resourceInlineLabelRisk: { color: colors.red },

  resourceBarTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  resourceBarTrackRisk: {
    backgroundColor: 'rgba(255,48,73,0.14)',
  },

  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,224,58,0.18)',
  },
  resourceBarAvailableRisk: {
    backgroundColor: 'rgba(255,48,73,0.12)',
  },

  resourceBarUsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: 999,
  },

  infoRow: {
    marginTop: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  infoRowText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  infoRowTextRisk: {
    color: colors.red,
  },

  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 18,
  },

  secondaryButton: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  primaryButton: {
    marginTop: 14,
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  errorWrap: {
    marginTop: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  authModalSafe: {
    flex: 1,
    backgroundColor: '#000000',
  },

  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: '#000000',
  },

  authScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },

  authContent: {
    paddingBottom: 18,
  },

  authCard: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 20,
  },

  authCardHeaderRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  authCardErrorText: {
    flex: 1,
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  authTitle: {
    marginTop: 8,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Sora_700Bold',
    maxWidth: '96%',
  },

  authTitleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  authLead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
    marginBottom: 6,
  },

  dot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
  },

  dotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  authCancelButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  authCancelButtonText: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
