import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import ScreenLoadingState from '../src/ui/screen-loading-state';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import NumericKeypad from '../src/ui/numeric-keypad';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  clearWalletRuntimeCaches,
  prependTokenHistoryCacheItem,
  prependWalletHistoryCacheItem,
} from '../src/services/tron/api';
import { applyOutgoingTransferToPortfolioCache } from '../src/services/wallet/portfolio';
import {
  estimateAssetTransfer,
  sendAssetTransfer,
  type SendAssetTransferEstimate,
} from '../src/services/wallet/send';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import { rememberRecentRecipient } from '../src/services/recent-recipients';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';

import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';

function formatResourceValue(value: number) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(safe);
}

function formatTrxAmountFromSun(value: number) {
  const trx = Math.max(0, Number(value || 0)) / 1_000_000;
  return trx.toFixed(trx >= 1 ? 3 : 6).replace(/\.?0+$/, '');
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] || '');
  return '';
}

export default function SendConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
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
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [energyQuote, setEnergyQuote] = useState<EnergyResaleQuote | null>(null);
  const [energyQuoteLoading, setEnergyQuoteLoading] = useState(false);
  const [energyRenting, setEnergyRenting] = useState(false);
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'send' | 'rent'>('send');
  const burnWarningShownRef = useRef(false);
  const preserveNoticeOnExitRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      if (!tokenId || !address || !amount) {
        throw new Error('Send request is incomplete. Go back and enter address and amount again.');
      }

      const nextEstimate = await estimateAssetTransfer({
        tokenId,
        toAddress: address,
        amount,
      });

      setEstimate(nextEstimate);
    } catch (error) {
      console.error(error);
      setEstimate(null);
      setErrorText(error instanceof Error ? error.message : 'Failed to build send confirmation.');
    } finally {
      setLoading(false);
    }
  }, [address, amount, tokenId]);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricsEnabled(enabled);
      setBiometricAvailable(enabled && compatible && enrolled);

      if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel('Face ID');
        return;
      }

      if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel('Fingerprint');
        return;
      }

      setBiometricLabel('Biometrics');
    } catch (error) {
      console.error(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricLabel('Biometrics');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBiometricsState();
  }, [loadBiometricsState]);

  useEffect(() => {
    if (!estimate) return;

    if (!estimate.trxCoverage.canCoverBurn) {
      if (burnWarningShownRef.current) return;

      burnWarningShownRef.current = true;
      notice.showErrorNotice(
        `Not enough TRX for network burn. Top up at least ${formatTrxAmountFromSun(
          estimate.trxCoverage.missingTrxSun
        )} TRX first.`,
        3200
      );
      return;
    }

    burnWarningShownRef.current = false;
    notice.hideNotice();
  }, [estimate, notice]);

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

  const energyAvailable = estimate
    ? Math.max(0, estimate.resources.available.energyLimit - estimate.resources.available.energyUsed)
    : 0;
  const bandwidthAvailable = estimate
    ? Math.max(0, estimate.resources.available.bandwidthLimit - estimate.resources.available.bandwidthUsed)
    : 0;

  const energyBarPercent = useMemo(() => {
    if (!estimate) return 0;
    const base = Math.max(estimate.resources.estimatedEnergy, energyAvailable, 1);
    return clampPercent((estimate.resources.estimatedEnergy / base) * 100);
  }, [energyAvailable, estimate]);

  const bandwidthBarPercent = useMemo(() => {
    if (!estimate) return 0;
    const base = Math.max(estimate.resources.estimatedBandwidth, bandwidthAvailable, 1);
    return clampPercent((estimate.resources.estimatedBandwidth / base) * 100);
  }, [bandwidthAvailable, estimate]);

  const hasResourceShortfall = Boolean(
    estimate &&
      (estimate.resources.energyShortfall > 0 || estimate.resources.bandwidthShortfall > 0)
  );
  const canRentEnergyForSend = Boolean(
    estimate &&
      !estimate.token.isNative &&
      estimate.resources.energyShortfall > 0
  );
  const hasNoEnergyAvailable = energyAvailable <= 0;
  const hasTrxForBurn = Boolean(estimate?.trxCoverage.canCoverBurn);
  const isApproveDisabled = sending || !estimate || !hasTrxForBurn;

  useEffect(() => {
    let cancelled = false;

    if (!estimate || !canRentEnergyForSend || estimate.wallet.kind === 'watch-only') {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      return;
    }

    setEnergyQuoteLoading(true);
    getEnergyResaleQuote({
      purpose: 'send_transfer',
      wallet: estimate.wallet.address,
    }).then((quote) => {
      if (!cancelled) setEnergyQuote(quote);
    }).finally(() => {
      if (!cancelled) setEnergyQuoteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canRentEnergyForSend, estimate]);

  const handleReject = useCallback(() => {
    if (sending) return;
    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice('Transfer rejected by user.', 2200);
    router.back();
  }, [notice, router, sending]);

  const performRentEnergy = useCallback(async () => {
    if (!estimate || !energyQuote || energyRenting) return;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'send_transfer',
        wallet: estimate.wallet.address,
        quote: energyQuote,
      });
      clearWalletRuntimeCaches(estimate.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Refreshing confirmation...', 3000);
      await load();
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Energy rental failed.',
        4200
      );
    } finally {
      setEnergyRenting(false);
    }
    setPasscodeOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
  }, [energyQuote, energyRenting, estimate, load, notice]);

  const performSend = useCallback(async () => {
    if (!estimate || sending) return;

    try {
      setSending(true);

      if (estimate.requestedTokenId !== estimate.token.tokenId) {
        throw new Error('Selected token changed before approval. Go back and rebuild the transfer.');
      }

      const result = await sendAssetTransfer({
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
      await applyOutgoingTransferToPortfolioCache({
        walletAddress: estimate.wallet.address,
        tokenId: estimate.token.tokenId,
        tokenDecimals: estimate.token.decimals,
        amountRaw: estimate.token.amountRaw,
        estimatedBurnSun: estimate.resources.estimatedBurnSun,
      });
      clearWalletRuntimeCaches(estimate.wallet.address);
      triggerWalletDataRefresh();
      notice.showSuccessNotice(
        `${estimate.token.symbol} sent. It will appear in history shortly.`,
        2800
      );
      preserveNoticeOnExitRef.current = true;

      router.replace('/wallet');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Transaction broadcast failed.',
        3200
      );
    } finally {
      setSending(false);
    }
  }, [contactName, estimate, notice, router, sending, triggerWalletDataRefresh]);

  const handlePasscodeSubmit = useCallback(async () => {
    if ((sending || energyRenting) || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      if (pendingApprovalMode === 'rent') {
        await performRentEnergy();
        return;
      }

      await performSend();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [energyRenting, passcodeDigits, pendingApprovalMode, performRentEnergy, performSend, sending]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async () => {
    if (!estimate || sending) return;
    if (!estimate.trxCoverage.canCoverBurn) return;
    setPendingApprovalMode('send');

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Transaction',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performSend();
          return;
        }

        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel'
        ) {
          return;
        }
      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, estimate, performSend, sending]);

  const handleRentEnergy = useCallback(async () => {
    if (!estimate || !energyQuote || sending || energyRenting) return;

    setPendingApprovalMode('rent');

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Energy Rental',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performRentEnergy();
          return;
        }

        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel'
        ) {
          return;
        }
      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [
    biometricAvailable,
    biometricsEnabled,
    energyQuote,
    energyRenting,
    estimate,
    performRentEnergy,
    sending,
  ]);

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
    return <ScreenLoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
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
          <ScreenBrow label="CONFIRM" variant="back" />

          {errorText || !estimate ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText || 'Unable to build confirmation.'}</Text>
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
                    <Text style={styles.heroFromLabel}>FROM</Text>
                    <Text style={styles.heroFromAddress}>{estimate.wallet.address}</Text>
                  </View>
                </View>

                <View style={styles.heroAmountRow}>
                  <View style={styles.heroAmountBlock}>
                    <Text style={styles.heroAmount}>{estimate.token.amount}</Text>
                  </View>

                  <View style={styles.heroTokenSide}>
                    <Text style={styles.heroBurnSideLabel}>BURN</Text>
                    <Text
                      style={[
                        styles.heroBurnSideValue,
                        hasResourceShortfall ? styles.heroBurnValueRisk : null,
                      ]}
                    >
                      {formatTrxAmountFromSun(estimate.resources.estimatedBurnSun)} TRX
                    </Text>
                  </View>
                </View>

                <View style={styles.heroTransferMeta}>
                  <View style={styles.heroAddressCol}>
                    <Text style={styles.heroAddressLabel}>TO</Text>
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
                  <Text style={styles.primaryButtonText}>
                    {hasTrxForBurn ? 'APPROVE & SEND' : 'TOP UP TRX'}
                  </Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={sending}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.detailCard}>
                <View style={styles.detailRowFirst}>
                  <Text style={styles.detailLabel}>Asset</Text>
                  <Text style={styles.detailValue}>{estimate.token.name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Amount</Text>
                  <Text style={styles.detailValue}>{estimate.token.amountDisplay}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Estimated Burn</Text>
                  <Text style={styles.detailValueAccent}>
                    {formatTrxAmountFromSun(estimate.resources.estimatedBurnSun)} TRX
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TRX Available</Text>
                  <Text style={styles.detailValue}>{estimate.trxCoverage.trxBalanceDisplay}</Text>
                </View>

                {!estimate.token.isNative ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fee Limit</Text>
                    <Text style={styles.detailValue}>
                      {formatTrxAmountFromSun(estimate.token.recommendedFeeLimitSun)} TRX
                    </Text>
                  </View>
                ) : null}
                <View style={styles.resourcesInlineRow}>
                  <View style={styles.resourceInlineCol}>
                    <Text
                      style={[
                        styles.resourceInlineLabel,
                        styles.resourcesEnergyText,
                        hasNoEnergyAvailable ? styles.resourcesEnergyTextRisk : null,
                      ]}
                    >
                      Energy {formatResourceValue(estimate.resources.estimatedEnergy)}/
                      {formatResourceValue(energyAvailable)}
                    </Text>
                    <View
                      style={[
                        styles.resourceBarTrack,
                        hasNoEnergyAvailable ? styles.resourceBarTrackRisk : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.resourceBarAvailable,
                          hasNoEnergyAvailable ? styles.resourceBarAvailableRisk : null,
                        ]}
                      />
                      <View style={[styles.resourceBarUsed, { width: `${energyBarPercent}%` }]} />
                    </View>
                  </View>

                  <View style={styles.resourceInlineCol}>
                    <Text style={styles.resourceInlineLabel}>
                      Bandwidth {formatResourceValue(estimate.resources.estimatedBandwidth)}/
                      {formatResourceValue(bandwidthAvailable)}
                    </Text>
                    <View style={styles.resourceBarTrack}>
                      <View style={styles.resourceBarAvailable} />
                      <View style={[styles.resourceBarUsed, { width: `${bandwidthBarPercent}%` }]} />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text
                  style={[styles.infoRowText, hasResourceShortfall ? styles.infoRowTextRisk : null]}
                >
                  {hasResourceShortfall
                    ? 'Resources are short. Network burn is included in the estimate above.'
                    : 'Resources are sufficient. This transfer should execute without extra burn.'}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={handleReject}
                disabled={sending}
              >
                <Text style={styles.secondaryButtonText}>REJECT</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <Modal
          visible={passcodeOpen}
          animationType="fade"
          presentationStyle="fullScreen"
          transparent={false}
          onRequestClose={() => setPasscodeOpen(false)}
          statusBarTranslucent
        >
          <SafeAreaView style={styles.authModalSafe} edges={['top', 'bottom']}>
            <View style={styles.authOverlay}>
              <View style={styles.authScreen}>
                <View style={styles.authContent}>
                  <Text style={ui.eyebrow}>Transaction Approval</Text>

                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>

                  <Text style={styles.authLead}>
                    Authorize this transfer with your 6-digit passcode
                    {biometricAvailable && biometricsEnabled
                      ? ` or ${biometricLabel === 'Face ID' ? 'face unlock' : 'fingerprint'}`
                      : ''}.
                  </Text>

                  <View style={styles.authCard}>
                    <View style={styles.authCardHeaderRow}>
                      <Text style={ui.sectionEyebrow}>Approve</Text>
                      <Text style={styles.authCardErrorText} numberOfLines={1}>
                        {passcodeError || ' '}
                      </Text>
                    </View>

                    <View style={styles.dotsRow}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <View
                          key={index}
                          style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]}
                        />
                      ))}
                    </View>
                  </View>

                  <NumericKeypad
                    onDigitPress={handlePasscodeDigitPress}
                    onBackspacePress={handlePasscodeBackspace}
                    leftSlot={
                      biometricAvailable && biometricsEnabled ? (
                        <TouchableOpacity activeOpacity={0.9} onPress={() => void handleApprove()}>
                          <BioLoginIcon width={22} height={22} />
                        </TouchableOpacity>
                      ) : null
                    }
                    backspaceIcon={<BackspaceIcon width={22} height={22} />}
                  />

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.authCancelButton}
                    onPress={() => setPasscodeOpen(false)}
                    disabled={sending}
                  >
                    <Text style={styles.authCancelButtonText}>CANCEL</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
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
    marginTop: 10,
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
    width: 70,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },

  heroBurnSideLabel: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
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

  detailCard: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
  },

  detailRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  detailRowFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  detailLabel: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  detailValue: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  detailValueAccent: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  resourcesInlineRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
  },

  resourceInlineCol: {
    flex: 1,
    gap: 8,
  },

  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  resourcesEnergyText: {
    color: colors.accent,
  },
  resourcesEnergyTextRisk: {
    color: colors.red,
  },

  resourceBarTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(24,224,58,0.14)',
  },
  resourceBarTrackRisk: {
    backgroundColor: 'rgba(255,48,73,0.14)',
  },

  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.green,
    opacity: 0.9,
  },
  resourceBarAvailableRisk: {
    backgroundColor: colors.red,
  },

  resourceBarUsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.red,
  },

  infoRow: {
    marginTop: 12,
    paddingHorizontal: 2,
  },

  infoRowText: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
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
    marginTop: 18,
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
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  primaryButton: {
    minHeight: 54,
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
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  errorWrap: {
    marginTop: 20,
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
