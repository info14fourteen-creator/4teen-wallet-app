import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { useNotice } from '../src/notice/notice-provider';
import {
  buildAmbassadorReferralLink,
  formatTrxFromSun,
  generateAmbassadorSlug,
  levelToLabel,
  loadAmbassadorScreenSnapshot,
  normalizeAmbassadorSlug,
  replayAmbassadorPendingRewards,
  type AmbassadorCabinetDashboard,
  type AmbassadorScreenSnapshot,
} from '../src/services/ambassador';
import { getCachedWalletPortfolio } from '../src/services/wallet/portfolio';
import { listWallets, setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { colors, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useWalletSession } from '../src/wallet/wallet-session';
import {
  ProductActionRow,
  ProductScreen,
  ProductSection,
  ProductStatGrid,
} from '../src/ui/product-shell';
import SelectedWalletSwitcher from '../src/ui/selected-wallet-switcher';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

type BusyAction = 'register' | 'withdraw' | 'replay' | 'wallet' | null;

type CabinetSectionId =
  | 'identity'
  | 'overview'
  | 'buyers'
  | 'purchases'
  | 'pending'
  | 'guide';

const DEFAULT_CABINET_SECTIONS: Record<CabinetSectionId, boolean> = {
  identity: true,
  overview: true,
  buyers: false,
  purchases: false,
  pending: false,
  guide: true,
};

function shortenAddress(address: string) {
  if (!address) return '—';
  return address.length > 14 ? `${address.slice(0, 7)}...${address.slice(-6)}` : address;
}

function asCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function formatChainDate(value: unknown) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return '—';

  const ms = raw > 1_000_000_000_000 ? raw : raw * 1000;
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMaybeDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return '—';

  const numeric = Number(raw);
  const dateMs = Number.isFinite(numeric)
    ? numeric > 1_000_000_000_000
      ? numeric
      : numeric * 1000
    : Date.parse(raw);

  if (!Number.isFinite(dateMs)) return raw;

  return new Date(dateMs).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function shortenMiddle(value: string, start = 10, end = 8) {
  const text = String(value || '').trim();
  if (!text || text.length <= start + end + 3) return text || '—';
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function readRowText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return '—';
}

function readRowSun(row: Record<string, unknown>, keys: string[]) {
  const value = readRowText(row, keys);
  return value === '—' ? '0.00' : formatTrxFromSun(value);
}

export default function AmbassadorProgramScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [snapshot, setSnapshot] = useState<AmbassadorScreenSnapshot | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [errorText, setErrorText] = useState('');
  const [cabinetSections, setCabinetSections] = useState(DEFAULT_CABINET_SECTIONS);
  const registerNoticeWalletIdRef = useRef<string | null>(null);

  useChromeLoading((loading && !snapshot) || refreshing || Boolean(busyAction));

  const load = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
      setSnapshot(null);
    }

    try {
      const [nextSnapshot, wallets] = await Promise.all([
        loadAmbassadorScreenSnapshot({ force: Boolean(options?.force) }),
        listWallets(),
      ]);
      const walletOptions = await Promise.all(
        wallets.map(async (wallet) => {
          const cachedPortfolio = await getCachedWalletPortfolio(wallet.address, {
            allowStale: true,
          });

          return {
            id: wallet.id,
            name: wallet.name,
            address: wallet.address,
            kind: wallet.kind,
            balanceDisplay: cachedPortfolio?.totalBalanceDisplay ?? '—',
          };
        })
      );

      setSnapshot(nextSnapshot);
      setErrorText('');
      setWalletOptionsOpen(false);
      setWalletChoices(walletOptions);

      if (nextSnapshot.status === 'register') {
        setSlug((current) => current.trim() || generateAmbassadorSlug());
      }
    } catch (error) {
      console.error(error);
      setSnapshot(null);
      setErrorText(error instanceof Error ? error.message : 'Failed to load ambassador data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const activeWallet = snapshot?.wallet ?? null;
  const cabinet = snapshot?.cabinet ?? null;
  const profile = snapshot?.profile ?? cabinet?.profile ?? null;
  const summary = cabinet?.summary ?? null;
  const fullAccessWalletChoices = useMemo(
    () => walletChoices.filter((wallet) => wallet.kind !== 'watch-only'),
    [walletChoices]
  );

  const selectedWalletOption = useMemo(
    () => walletChoices.find((wallet) => wallet.id === activeWallet?.id) ?? null,
    [activeWallet?.id, walletChoices]
  );

  const visibleWalletChoices = useMemo(
    () => fullAccessWalletChoices.filter((wallet) => wallet.id !== activeWallet?.id),
    [activeWallet?.id, fullAccessWalletChoices]
  );

  const isWatchOnlyWallet = activeWallet?.kind === 'watch-only' || snapshot?.status === 'watch-only';
  const canRegister =
    snapshot?.status === 'register' &&
    !isWatchOnlyWallet &&
    Boolean(snapshot.signingWalletAvailable) &&
    normalizeAmbassadorSlug(slug).length >= 3;
  const canWithdraw = asCount(summary?.claimable_rewards_sun) > 0 && activeWallet?.kind !== 'watch-only';
  const hasPendingRows = (cabinet?.pendingTotal || cabinet?.pendingRows.length || 0) > 0;

  useEffect(() => {
    if (snapshot?.status !== 'register' || !snapshot.wallet?.id) {
      return;
    }

    if (registerNoticeWalletIdRef.current === snapshot.wallet.id) {
      return;
    }

    registerNoticeWalletIdRef.current = snapshot.wallet.id;
    notice.showNeutralNotice('This wallet is not registered as ambassador yet.', 2200);
  }, [notice, snapshot?.status, snapshot?.wallet?.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true, force: true });
  }, [load]);

  const handleToggleCabinetSection = useCallback((section: CabinetSectionId) => {
    setCabinetSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const handleCopy = useCallback(
    async (value: string, label: string) => {
      if (!value) return;
      await Clipboard.setStringAsync(value);
      notice.showSuccessNotice(`${label} copied.`, 1800);
    },
    [notice]
  );

  const handleShare = useCallback(
    async (value: string, label: string) => {
      if (!value) return;

      try {
        await Share.share({
          message: value,
          url: value,
        });
      } catch (error) {
        console.error(error);
        notice.showErrorNotice(`Failed to share ${label.toLowerCase()}.`, 2200);
      }
    },
    [notice]
  );

  const handleToggleWalletOptions = useCallback(() => {
    const availableFullAccessWallets = walletChoices.filter((wallet) => wallet.kind !== 'watch-only');

    if (availableFullAccessWallets.length === 0) {
      notice.showNeutralNotice('No full-access wallets available.', 2400);
      return;
    }

    if (
      availableFullAccessWallets.length === 1 &&
      availableFullAccessWallets[0]?.id === activeWallet?.id
    ) {
      notice.showNeutralNotice('No other full-access wallets available.', 2200);
      return;
    }

    setWalletOptionsOpen((prev) => !prev);
  }, [activeWallet?.id, notice, walletChoices]);

  const handleChooseWallet = useCallback(
    async (wallet: WalletSwitcherItem) => {
      if (wallet.kind === 'watch-only') {
        notice.showNeutralNotice('Watch-only wallets are not available here.', 2400);
        return;
      }

      try {
        setBusyAction('wallet');
        setSwitchingWalletId(wallet.id);
        setWalletOptionsOpen(false);
        await setActiveWalletId(wallet.id);
        setPendingWalletSelectionId(wallet.id);
        await load({ silent: true, force: true });
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch ambassador wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
        setBusyAction(null);
      }
    },
    [load, notice, setPendingWalletSelectionId]
  );

  const handleNormalizeSlug = useCallback((value: string) => {
    setSlug(normalizeAmbassadorSlug(value));
  }, []);

  const handleRegister = useCallback(async () => {
    if (!canRegister) {
      notice.showErrorNotice('Enter a valid ambassador slug.', 2200);
      return;
    }

    router.push({
      pathname: '/ambassador-confirm',
      params: {
        slug: normalizeAmbassadorSlug(slug),
      },
    });
  }, [canRegister, notice, router, slug]);

  const handleWithdraw = useCallback(async () => {
    router.push('/ambassador-withdraw-confirm');
  }, [router]);

  const handleReplayPending = useCallback(async () => {
    if (!profile?.wallet) return;

    try {
      setBusyAction('replay');
      await replayAmbassadorPendingRewards(profile.wallet);
      notice.showSuccessNotice('Pending rewards replay requested.', 2600);
      await load({ silent: true, force: true });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Replay request failed.',
        3200
      );
    } finally {
      setBusyAction(null);
    }
  }, [load, notice, profile?.wallet]);

  if (loading && !snapshot) {
    return <ScreenLoadingState label="Loading ambassador module" />;
  }

  return (
    <ProductScreen
      eyebrow="AMBASSADOR"
      keyboardAware={snapshot?.status === 'register'}
      keyboardExtraScrollHeight={96}
      loadingOverlayVisible={refreshing || Boolean(switchingWalletId) || Boolean(busyAction)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg}
        />
      }
    >
      {activeWallet ? (
        <SelectedWalletSwitcher
          wallet={{
            id: activeWallet.id,
            name: activeWallet.name,
            address: activeWallet.address,
            kind: activeWallet.kind,
            balanceDisplay: selectedWalletOption?.balanceDisplay ?? '—',
          }}
          visibleWalletChoices={visibleWalletChoices}
          walletOptionsOpen={walletOptionsOpen}
          switchingWalletId={switchingWalletId}
          onToggle={handleToggleWalletOptions}
          onChooseWallet={handleChooseWallet}
        />
      ) : (
        <ProductSection eyebrow="WALLET REQUIRED" title="No active wallet">
          <Text style={ui.body}>
            Import or create a wallet before ambassador registration or cabinet lookup can run.
          </Text>
          <ProductActionRow
            primaryLabel="Import Wallet"
            onPrimaryPress={() => router.push('/import-wallet')}
            secondaryLabel="Create Wallet"
            onSecondaryPress={() => router.push('/create-wallet')}
          />
        </ProductSection>
      )}

      {errorText ? <StatusCard tone="danger" text={errorText} /> : null}
      {snapshot?.message && snapshot.status !== 'register' ? (
        <StatusCard tone={isWatchOnlyWallet ? 'danger' : 'neutral'} text={snapshot.message} />
      ) : null}

      {isWatchOnlyWallet ? (
        <ProductSection eyebrow="FULL ACCESS REQUIRED" title="Ambassador is locked for this wallet">
          <Text style={ui.body}>
            Watch-only wallets cannot register, withdraw, replay rewards, or open the ambassador cabinet here.
            Switch to a seed phrase or private-key wallet.
          </Text>
          <ProductActionRow
            primaryLabel="Import Wallet"
            onPrimaryPress={() => router.push('/import-wallet')}
            secondaryLabel="Create Wallet"
            onSecondaryPress={() => router.push('/create-wallet')}
          />
        </ProductSection>
      ) : null}

      {snapshot?.status === 'cabinet' && cabinet && summary && !isWatchOnlyWallet ? (
        <CabinetView
          cabinet={cabinet}
          canWithdraw={canWithdraw}
          hasPendingRows={hasPendingRows}
          busyAction={busyAction}
          sections={cabinetSections}
          onCopy={handleCopy}
          onShare={handleShare}
          onWithdraw={() => void handleWithdraw()}
          onReplay={() => void handleReplayPending()}
          onToggleSection={handleToggleCabinetSection}
        />
      ) : null}

      {snapshot?.status === 'register' && !isWatchOnlyWallet ? (
        <RegistrationView
          slug={slug}
          signingWalletAvailable={snapshot.signingWalletAvailable}
          walletKind={snapshot.wallet?.kind}
          busyAction={busyAction}
          canRegister={canRegister}
          onChangeSlug={handleNormalizeSlug}
          onRegister={() => void handleRegister()}
        />
      ) : null}
    </ProductScreen>
  );
}

function CabinetView({
  cabinet,
  canWithdraw,
  hasPendingRows,
  busyAction,
  sections,
  onCopy,
  onShare,
  onWithdraw,
  onReplay,
  onToggleSection,
}: {
  cabinet: AmbassadorCabinetDashboard;
  canWithdraw: boolean;
  hasPendingRows: boolean;
  busyAction: BusyAction;
  sections: Record<CabinetSectionId, boolean>;
  onCopy: (value: string, label: string) => void;
  onShare: (value: string, label: string) => void;
  onWithdraw: () => void;
  onReplay: () => void;
  onToggleSection: (section: CabinetSectionId) => void;
}) {
  const { profile, summary } = cabinet;
  const referralLink = profile.referralLink;
  const claimableSun = summary.claimable_rewards_sun || '0';
  const claimedTotalSun = summary.total_rewards_claimed_sun || '0';
  const accruedTotalSun = summary.total_rewards_accrued_sun || '0';
  const processedRewardSun = summary.buyers_processed_reward_sun || '0';
  const pendingRewardSun = summary.buyers_pending_reward_sun || '0';
  const pendingCount = asCount(cabinet.pendingTotal || cabinet.pendingRows.length);
  const processedCount = asCount(summary.processed_count);
  const remainingToNextLevel = asCount(summary.level_remaining_to_next);

  return (
    <>
      <ProductStatGrid
        items={[
          {
            eyebrow: 'Slug',
            value: profile.slug || '—',
            body: profile.status.toUpperCase(),
          },
          {
            eyebrow: 'Level',
            value: levelToLabel(summary.effective_level),
            body: `${summary.reward_percent || 0}% reward tier`,
          },
          {
            eyebrow: 'Reward',
            value: `${summary.reward_percent || 0}%`,
            body: 'Current effective reward',
          },
          {
            eyebrow: 'Claimable',
            value: `${formatTrxFromSun(summary.claimable_rewards_sun)} TRX`,
            body: `${formatTrxFromSun(summary.total_rewards_accrued_sun)} TRX accrued`,
          },
        ]}
      />

      <View style={styles.topCluster}>
        <View style={styles.statusGrid}>
          <RewardStatusCard
            label="Claimable now"
            value={`${formatTrxFromSun(claimableSun)} TRX`}
            meta={`${claimableSun} SUN`}
            tone={canWithdraw ? 'green' : 'default'}
          />
          <RewardStatusCard
            label="Claimed total"
            value={`${formatTrxFromSun(claimedTotalSun)} TRX`}
            meta={`${claimedTotalSun} SUN already withdrawn`}
            tone={asCount(claimedTotalSun) > 0 ? 'orange' : 'default'}
          />
          <RewardStatusCard
            label="Pending reward"
            value={`${formatTrxFromSun(pendingRewardSun)} TRX`}
            meta={
              pendingCount > 0
                ? `${pendingRewardSun} SUN · ${pendingCount} row(s) can be replayed`
                : 'No pending backend rows to replay'
            }
            tone={pendingCount > 0 ? 'amber' : 'default'}
          />
        </View>

        <View style={styles.actionGrid}>
          <ActionPill
            label="WITHDRAW"
            icon="cash-fast"
            disabled={!canWithdraw || busyAction === 'withdraw'}
            busy={busyAction === 'withdraw'}
            onPress={onWithdraw}
          />
          <ActionPill
            label="REPLAY PENDING"
            icon="reload"
            variant="secondary"
            disabled={!hasPendingRows || busyAction === 'replay'}
            busy={busyAction === 'replay'}
            onPress={onReplay}
          />
        </View>

        <View style={styles.actionGrid}>
          <ActionPill
            label="COPY LINK"
            icon="content-copy"
            variant="secondary"
            disabled={!referralLink}
            onPress={() => onCopy(referralLink, 'Referral link')}
          />
          <ActionPill
            label="SHARE LINK"
            icon="share-variant"
            variant="secondary"
            disabled={!referralLink}
            onPress={() => onShare(referralLink, 'Referral link')}
          />
        </View>
      </View>

      <CabinetAccordionSection
        id="identity"
        title="Identity"
        open={sections.identity}
        onToggle={onToggleSection}
      >
        <View style={styles.flatPanel}>
          <InfoRow label="Slug" value={profile.slug || 'Not assigned yet'} accent={Boolean(profile.slug)} />
          <InfoRow label="Wallet" value={shortenAddress(profile.wallet)} />
          <InfoRow label="Status" value={summary.active === false ? 'Inactive' : 'Active'} accent={summary.active !== false} />
          <InfoRow label="Level" value={levelToLabel(summary.effective_level)} />
          <InfoRow label="Reward percent" value={`${summary.reward_percent || 0}%`} />
          <InfoRow label="Created" value={formatChainDate(summary.created_at_chain)} />
        </View>
      </CabinetAccordionSection>

      <CabinetAccordionSection
        id="overview"
        title="Overview"
        open={sections.overview}
        onToggle={onToggleSection}
      >
        <View style={styles.flatPanel}>
          <InfoRow label="Linked buyers" value={String(asCount(summary.buyers_count || summary.total_buyers))} />
          <InfoRow label="Attributed volume" value={`${formatTrxFromSun(summary.buyers_total_purchase_amount_sun || summary.total_volume_sun)} TRX`} />
          <InfoRow label="Accrued total" value={`${formatTrxFromSun(summary.buyers_total_reward_sun || accruedTotalSun)} TRX`} />
          <InfoRow label="Claimed total" value={`${formatTrxFromSun(claimedTotalSun)} TRX`} />
          <InfoRow label="Processed backend reward" value={`${formatTrxFromSun(processedRewardSun)} TRX`} />
          <InfoRow label="Pending reward" value={`${formatTrxFromSun(pendingRewardSun)} TRX`} accent={pendingCount > 0} />
          <InfoRow label="Processed rows" value={String(processedCount)} />
          <InfoRow label="Pending rows" value={String(pendingCount)} accent={pendingCount > 0} />
          <InfoRow label="Level" value={`${levelToLabel(summary.effective_level)} · ${summary.reward_percent || 0}%`} />
          <InfoRow
            label="Next level"
            value={
              remainingToNextLevel > 0
                ? `${remainingToNextLevel} buyer(s) left`
                : 'Max tier reached'
            }
            accent={remainingToNextLevel <= 0}
          />
        </View>
      </CabinetAccordionSection>

      <RowsPreview
        sectionId="buyers"
        open={sections.buyers}
        onToggle={onToggleSection}
        eyebrow="BUYERS"
        title="Bound buyers"
        empty="No bound buyers yet."
        rows={cabinet.buyersRows}
        total={cabinet.buyersTotal}
        renderTitle={(row) => shortenAddress(readRowText(row, ['buyer_wallet', 'buyer', 'wallet']))}
        renderMeta={(row) =>
          [
            `Bound ${formatMaybeDate(readRowText(row, ['binding_at', 'created_at']))}`,
            `${readRowText(row, ['purchase_count'])} purchases`,
            `${readRowSun(row, ['total_purchase_amount_sun', 'purchase_amount_sun'])} TRX volume`,
            `${readRowSun(row, ['total_reward_amount_sun', 'ambassador_reward_sun'])} TRX reward`,
            `${readRowText(row, ['processed_purchase_count'])} processed`,
            `${readRowText(row, ['pending_purchase_count'])} pending`,
          ].join(' · ')
        }
      />

      <RowsPreview
        sectionId="purchases"
        open={sections.purchases}
        onToggle={onToggleSection}
        eyebrow="PURCHASES"
        title="Tracked purchases"
        empty="No tracked purchases yet."
        rows={cabinet.purchasesRows}
        total={cabinet.purchasesTotal}
        renderTitle={(row) =>
          `${formatMaybeDate(readRowText(row, ['token_block_time', 'created_at']))} · ${shortenAddress(readRowText(row, ['buyer_wallet', 'buyer', 'wallet']))}`
        }
        renderMeta={(row) =>
          [
            `${readRowSun(row, ['purchase_amount_sun'])} TRX purchase`,
            `${readRowSun(row, ['ambassador_reward_sun', 'reward_sun'])} TRX reward`,
            `status ${readRowText(row, ['status'])}`,
            `processed ${readRowText(row, ['controller_processed']) === 'true' ? 'yes' : 'no'}`,
            shortenMiddle(readRowText(row, ['tx_hash', 'txid', 'transaction_id'])),
          ].join(' · ')
        }
      />

      <RowsPreview
        sectionId="pending"
        open={sections.pending}
        onToggle={onToggleSection}
        eyebrow="PENDING"
        title="Pending allocation"
        empty="No pending allocation rows."
        rows={cabinet.pendingRows}
        total={cabinet.pendingTotal}
        renderTitle={(row) =>
          `${formatMaybeDate(readRowText(row, ['token_block_time', 'created_at']))} · ${shortenAddress(readRowText(row, ['buyer_wallet', 'buyer', 'wallet']))}`
        }
        renderMeta={(row) =>
          [
            `${readRowSun(row, ['purchase_amount_sun'])} TRX purchase`,
            `${readRowSun(row, ['ambassador_reward_sun', 'reward_sun'])} TRX reward`,
            `status ${readRowText(row, ['status'])}`,
            shortenMiddle(readRowText(row, ['tx_hash', 'txid', 'transaction_id'])),
          ].join(' · ')
        }
      />

      <CabinetAccordionSection
        id="guide"
        title="How this cabinet works"
        open={sections.guide}
        onToggle={onToggleSection}
      >
        <Text style={ui.body}>
          This cabinet combines direct on-chain reads from FourteenController with
          backend purchase rows served through the 4TEEN proxy.
        </Text>
        <Text style={ui.body}>
          Claimable now is the only amount that can be withdrawn on-chain right now.
          Claimed total is historical volume already withdrawn from the contract.
        </Text>
        <Text style={ui.body}>
          Processed backend reward is accounting history, not a separate withdraw action.
          Pending reward means purchases are already attributed in the backend but not
          fully replayed into the latest cabinet state yet.
        </Text>
        <Text style={ui.body}>
          Replay pending sends a backend replay request for rows still marked as pending.
          It does not send a wallet transaction and does not spend TRX by itself.
        </Text>
        <Text style={ui.body}>
          Referral sharing uses one canonical link only. The cabinet copies and shares the
          same ambassador link, so attribution stays consistent and the backend receives the
          same slug every time.
        </Text>
      </CabinetAccordionSection>
    </>
  );
}

function RegistrationView({
  slug,
  signingWalletAvailable,
  walletKind,
  busyAction,
  canRegister,
  onChangeSlug,
  onRegister,
}: {
  slug: string;
  signingWalletAvailable: boolean;
  walletKind?: WalletMeta['kind'];
  busyAction: BusyAction;
  canRegister: boolean;
  onChangeSlug: (value: string) => void;
  onRegister: () => void;
}) {
  const normalizedSlug = normalizeAmbassadorSlug(slug);
  const referralPreview = normalizedSlug ? buildAmbassadorReferralLink(normalizedSlug) : '—';

  return (
    <View style={styles.registrationBlock}>
      <Text style={ui.sectionEyebrow}>AMBASSADOR REGISTRATION</Text>
      <Text style={styles.registrationTitle}>Create ambassador profile</Text>
      <Text style={ui.body}>
        Continue to confirm, review resources, optionally rent Energy, then approve with biometrics or passcode.
      </Text>

      <View style={styles.registrationPreview}>
        <Text style={styles.registrationPreviewLabel}>Referral link preview</Text>
        <Text style={styles.registrationPreviewValue} numberOfLines={1}>
          {referralPreview}
        </Text>
      </View>

      <View style={styles.inputBlock}>
        <Text style={styles.inputLabel}>Referral slug</Text>
        <TextInput
          value={slug}
          onChangeText={onChangeSlug}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          multiline={false}
          numberOfLines={1}
          maxLength={24}
          keyboardAppearance="dark"
          selectionColor={colors.accent}
          returnKeyType="done"
          blurOnSubmit
          placeholder="your-slug"
          placeholderTextColor={colors.textDim}
          style={styles.slugInput}
        />
        <Text style={styles.inputHint}>
          3-24 chars. Lowercase letters, numbers, dash or underscore.
        </Text>
        <Text style={styles.registrationWarning}>
          Slug is permanent. After registration it cannot be changed from the wallet.
        </Text>
      </View>

      {walletKind === 'watch-only' ? (
        <StatusCard
          tone="danger"
          text="Watch-only wallet cannot register. Select or import a seed/private-key wallet first."
        />
      ) : null}

      <ProductActionRow
        primaryLabel="CONTINUE TO CONFIRM"
        onPrimaryPress={onRegister}
      />
    </View>
  );
}

function RowsPreview({
  sectionId,
  open,
  onToggle,
  eyebrow,
  title,
  empty,
  rows,
  total,
  renderTitle,
  renderMeta,
}: {
  sectionId: CabinetSectionId;
  open: boolean;
  onToggle: (section: CabinetSectionId) => void;
  eyebrow: string;
  title: string;
  empty: string;
  rows: Record<string, unknown>[];
  total: number;
  renderTitle: (row: Record<string, unknown>) => string;
  renderMeta: (row: Record<string, unknown>) => string;
}) {
  return (
    <CabinetAccordionSection
      id={sectionId}
      title={`${title} (${total || rows.length})`}
      open={open}
      onToggle={onToggle}
      eyebrow={eyebrow}
    >
      {rows.length ? (
        <View style={styles.rowsList}>
          {rows.map((row, index) => (
            <View key={`${eyebrow}-${index}`} style={styles.previewRow}>
              <View style={styles.previewRowIcon}>
                <MaterialCommunityIcons name="link-variant" size={17} color={colors.accent} />
              </View>
              <View style={styles.previewRowText}>
                <Text style={styles.previewRowTitle} numberOfLines={1}>
                  {renderTitle(row)}
                </Text>
                <Text style={styles.previewRowMeta} numberOfLines={2}>
                  {renderMeta(row)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={ui.body}>{empty}</Text>
      )}
    </CabinetAccordionSection>
  );
}

function CabinetAccordionSection({
  id,
  title,
  open,
  onToggle,
  children,
  eyebrow,
}: {
  id: CabinetSectionId;
  title: string;
  open: boolean;
  onToggle: (section: CabinetSectionId) => void;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <View style={styles.accordionCard}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.accordionHeader}
        onPress={() => onToggle(id)}
      >
        <View style={styles.accordionHeaderText}>
          {eyebrow ? <Text style={ui.sectionEyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.accordionTitle}>{title}</Text>
        </View>
        <MaterialCommunityIcons
          name={open ? 'minus' : 'plus'}
          size={20}
          color={open ? colors.green : colors.accent}
        />
      </TouchableOpacity>
      {open ? <View style={styles.accordionContent}>{children}</View> : null}
    </View>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, accent ? styles.infoValueAccent : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StatusCard({ tone, text }: { tone: 'neutral' | 'danger' | 'success'; text: string }) {
  return (
    <View
      style={[
        styles.statusCard,
        tone === 'danger' ? styles.statusDanger : tone === 'success' ? styles.statusSuccess : null,
      ]}
    >
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

function RewardStatusCard({
  label,
  value,
  meta,
  tone = 'default',
}: {
  label: string;
  value: string;
  meta: string;
  tone?: 'default' | 'green' | 'amber' | 'orange';
}) {
  return (
    <View
      style={[
        styles.rewardStatusCard,
        tone === 'green' ? styles.rewardStatusCardGreen : null,
        tone === 'orange' ? styles.rewardStatusCardOrange : null,
        tone === 'amber' ? styles.rewardStatusCardAmber : null,
      ]}
    >
      <Text style={styles.rewardStatusLabel}>{label}</Text>
      <Text style={styles.rewardStatusValue}>{value}</Text>
      <Text style={styles.rewardStatusMeta}>{meta}</Text>
    </View>
  );
}

function ActionPill({
  label,
  icon,
  variant = 'primary',
  disabled,
  busy,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={disabled || busy}
      style={[
        styles.actionPill,
        variant === 'secondary' ? styles.actionPillSecondary : styles.actionPillPrimary,
        disabled || busy ? styles.actionPillDisabled : null,
      ]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={variant === 'secondary' ? colors.accent : colors.white}
        />
      )}
      <Text style={styles.actionPillText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  selectionBlock: {
    marginBottom: 16,
  },
  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  walletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletCardClosed: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },
  walletCardOpen: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },
  walletCardText: {
    flex: 1,
    gap: 4,
  },
  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  walletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  walletOptionsList: {
    gap: 10,
    marginTop: 10,
  },
  walletOptionRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletOptionText: {
    flex: 1,
    gap: 4,
  },
  optionBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  optionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  topCluster: {
    gap: 12,
    marginBottom: 16,
  },
  flatPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  accordionCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginBottom: 14,
    overflow: 'hidden',
  },
  accordionHeader: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  accordionHeaderText: {
    flex: 1,
    gap: 3,
  },
  accordionTitle: {
    ...ui.titleSm,
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoRow: {
    minHeight: 45,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  infoLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },
  infoValue: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    flex: 1,
  },
  infoValueAccent: {
    color: colors.green,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionPill: {
    minHeight: 52,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionPillPrimary: {
    backgroundColor: colors.accent,
  },
  actionPillSecondary: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
  },
  actionPillDisabled: {
    opacity: 0.42,
  },
  actionPillText: {
    ...ui.actionLabel,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  registrationBlock: {
    gap: 12,
    marginBottom: 16,
  },
  registrationTitle: {
    ...ui.titleSm,
  },
  registrationPreview: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  registrationPreviewLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  registrationPreviewValue: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
  inputBlock: {
    gap: 8,
  },
  inputLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  slugInput: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
  },
  inputHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
  },
  registrationWarning: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  statusCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  statusDanger: {
    borderColor: 'rgba(255,48,73,0.28)',
    backgroundColor: 'rgba(255,48,73,0.08)',
  },
  statusSuccess: {
    borderColor: 'rgba(24,224,58,0.24)',
    backgroundColor: 'rgba(24,224,58,0.07)',
  },
  statusText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  statusGrid: {
    gap: 12,
  },
  rewardStatusCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  rewardStatusCardGreen: {
    borderColor: 'rgba(24,224,58,0.24)',
    backgroundColor: 'rgba(24,224,58,0.07)',
  },
  rewardStatusCardAmber: {
    borderColor: 'rgba(255,105,0,0.28)',
    backgroundColor: 'rgba(255,105,0,0.08)',
  },
  rewardStatusCardOrange: {
    borderColor: 'rgba(255,105,0,0.34)',
    backgroundColor: 'rgba(255,105,0,0.12)',
  },
  rewardStatusLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rewardStatusValue: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Sora_700Bold',
  },
  rewardStatusMeta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  rowsList: {
    gap: 10,
  },
  previewRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewRowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,105,0,0.08)',
  },
  previewRowText: {
    flex: 1,
    gap: 2,
  },
  previewRowTitle: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
  previewRowMeta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  inlineAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },
});
