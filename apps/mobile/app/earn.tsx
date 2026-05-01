import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { getLanguageLocaleTag, useI18n } from '../src/i18n';
import {
  ProductActionRow,
  ProductBulletList,
  ProductHero,
  ProductScreen,
  ProductSection,
  ProductStatGrid,
} from '../src/ui/product-shell';
import ConfirmNetworkLoadCard from '../src/ui/confirm-network-load-card';
import { colors } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import {
  loadAmbassadorAllocationHealth,
  type AmbassadorAllocationHealth,
} from '../src/services/ambassador';
import {
  loadAssetWalletsSnapshot,
  type AssetWalletSnapshotItem,
  type AssetWalletsSnapshot,
} from '../src/services/asset-wallets';
import { formatResourceAmount } from '../src/services/wallet/resources';

const SMART_CONTRACTS_REPO_URL =
  'https://github.com/info14fourteen-creator/4teen-smart-contracts';
const INFO_SCREEN_INFO_TITLE = 'How the protocol is wired';
const INFO_SCREEN_INFO_TEXT =
  'This screen is the compact map of the 4TEEN system. It shows which contracts and vaults handle token minting, controller logic, liquidity execution, community distribution, and operator-side runtime checks.\n\nUse it when you need two answers fast: which on-chain component is responsible for a protocol job, and whether the current runtime state is ready for ambassador allocation replay.\n\nThis is not a transaction screen. Its job is orientation and verification: contract roles, asset-wallet balances, and operational readiness across the main protocol rails.';

const CONTRACT_LINKS = [
  {
    label: 'FourteenToken',
    address: 'TMLXiC...3n9x4A',
    body: 'mint, direct buy, 14-day lock, TRX split',
    url: 'https://tronscan.org/#/token20/TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A',
  },
  {
    label: 'FourteenController',
    address: 'TF8yho...sAFkeZ',
    body: 'token admin layer, ambassador/referral accounting',
    url: 'https://tronscan.org/#/contract/TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ',
  },
  {
    label: 'LiquidityController',
    address: 'TVKBLw...nvYEuZ',
    body: '100 TRX threshold, once-per-day 6.43% release',
    url: 'https://tronscan.org/#/contract/TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ',
  },
  {
    label: 'LiquidityBootstrapper',
    address: 'TWfUee...UaJ7dc',
    body: 'prepares executor token balances, then triggers controller',
    url: 'https://tronscan.org/#/contract/TWfUee6qFV91t7KbFdYLEfpi8nprUaJ7dc',
  },
  {
    label: 'JustMoney Executor',
    address: 'TWrz68...BxiHw7F',
    body: 'JustMoney liquidity execution path',
    url: 'https://tronscan.org/#/contract/TWrz68MRTf1m9vv8xpcdMD4z9kjBxiHw7F',
  },
  {
    label: 'Sun.io V3 Executor',
    address: 'TU8EwE...uR46xh',
    body: 'Sun.io V3 liquidity execution path',
    url: 'https://tronscan.org/#/contract/TU8EwEWg4K594zwThvhTZxqzEuEYuR46xh',
  },
  {
    label: 'FourteenVault',
    address: 'TNwkuH...JEZTq',
    body: 'liquidity reserve tokens',
    url: 'https://tronscan.org/#/contract/TNwkuHA727RZGtpbowH7q5B1yZWk2JEZTq',
  },
  {
    label: 'AirdropVault',
    address: 'TV6eXK...NBwpQ',
    body: 'community distribution reserve',
    url: 'https://tronscan.org/#/contract/TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ',
  },
  {
    label: 'TeamLockVault',
    address: 'TYBfbg...KWZS3h',
    body: 'team allocation lock vault',
    url: 'https://tronscan.org/#/contract/TYBfbgvMW6awPdZfSSwWoEX3nJjrKWZS3h',
  },
] as const;

export default function EarnScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [assetWallets, setAssetWallets] = useState<AssetWalletsSnapshot | null>(null);
  const [assetWalletsLoading, setAssetWalletsLoading] = useState(true);
  const [assetWalletsRefreshing, setAssetWalletsRefreshing] = useState(false);
  const [assetWalletsError, setAssetWalletsError] = useState('');
  const [allocationHealth, setAllocationHealth] = useState<AmbassadorAllocationHealth | null>(null);
  const [allocationHealthLoading, setAllocationHealthLoading] = useState(true);
  const [allocationHealthError, setAllocationHealthError] = useState('');

  const refreshAssetWallets = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;

    if (force) {
      setAssetWalletsRefreshing(true);
    } else {
      setAssetWalletsLoading(true);
    }

    try {
      const snapshot = await loadAssetWalletsSnapshot({ force });
      setAssetWallets(snapshot);
      setAssetWalletsError(snapshot.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Could not load asset wallets.');
      setAssetWalletsError(message);
    } finally {
      setAssetWalletsLoading(false);
      setAssetWalletsRefreshing(false);
    }
  }, [t]);

  const refreshAllocationHealth = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;

    if (force || !allocationHealth) {
      setAllocationHealthLoading(true);
    }

    try {
      const snapshot = await loadAmbassadorAllocationHealth({ force });
      setAllocationHealth(snapshot);
      setAllocationHealthError('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Could not load ambassador allocation status.');
      setAllocationHealth(null);
      setAllocationHealthError(message);
    } finally {
      setAllocationHealthLoading(false);
    }
  }, [allocationHealth, t]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refreshAssetWallets(), refreshAllocationHealth()]);
    }, [refreshAssetWallets, refreshAllocationHealth])
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refreshAssetWallets({ force: true }),
      refreshAllocationHealth({ force: true }),
    ]);
  }, [refreshAssetWallets, refreshAllocationHealth]);

  const allocationRequirements = allocationHealth?.requirements;
  const allocationResources = allocationHealth?.resources;
  const allocationResourceState = allocationHealth?.resourceState;
  const allocationRuntime = allocationHealth?.runtime;
  const operatorRuntime = allocationRuntime?.operator ?? null;
  const airdropControlRuntime = allocationRuntime?.airdropControl ?? null;
  const gasStationRuntime = allocationRuntime?.gasStation ?? null;
  const allocationNeedEnergy = Math.max(
    0,
    Number(allocationRequirements?.requiredEnergy || 0) +
      Number(allocationRequirements?.minEnergyFloor || 0)
  );
  const allocationNeedBandwidth = Math.max(
    0,
    Number(allocationRequirements?.requiredBandwidth || 0) +
      Number(allocationRequirements?.minBandwidthFloor || 0)
  );
  const allocationAvailableEnergy = Math.max(0, Number(allocationResources?.energyAvailable || 0));
  const allocationAvailableBandwidth = Math.max(0, Number(allocationResources?.bandwidthAvailable || 0));
  const allocationEnergyShortfall = Math.max(0, allocationNeedEnergy - allocationAvailableEnergy);
  const allocationBandwidthShortfall = Math.max(
    0,
    allocationNeedBandwidth - allocationAvailableBandwidth
  );
  const allocationReadyLabel = allocationResourceState?.hasEnough
    ? t('Ready now')
    : t('Waiting for resource top-up');
  const allocationReadyBody = allocationResourceState?.hasEnough
    ? t('The operator wallet is above the safe floor. New ambassador rewards can be pushed into FourteenController without waiting for a replay cycle.')
    : t('If the operator wallet falls below the safe floor, the backend keeps pending rows in queue, tries to rent resources, and the hourly replay checks again until the reward lands on-chain.');

  return (
    <ProductScreen
      eyebrow={t('INFORMATION')}
      headerInfo={{
        title: t(INFO_SCREEN_INFO_TITLE),
        text: t(INFO_SCREEN_INFO_TEXT),
        expanded: infoExpanded,
        onToggle: () => setInfoExpanded((prev) => !prev),
      }}
      refreshControl={
        <RefreshControl
          refreshing={assetWalletsRefreshing || (allocationHealthLoading && assetWallets !== null)}
          onRefresh={() => void handleRefresh()}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <ProductHero
        eyebrow={t('BLOCKCHAIN ARCHITECTURE')}
        title={t('4TEEN is a TRON contract system.')}
        body={t('The app is only an interface. The architecture is built around token minting, purchase locks, fixed TRX routing, liquidity execution, vault custody, and referral accounting on-chain.')}
      >
        <ProductActionRow
          primaryLabel={t('CONTRACTS REPO')}
          onPrimaryPress={() => void openInAppBrowser(router, SMART_CONTRACTS_REPO_URL)}
          secondaryLabel={t('LIQUIDITY')}
          onSecondaryPress={() => router.push('/liquidity-controller')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: t('Buy routing'),
            value: '90 / 7 / 3',
            body: t('TRX routes to liquidity, referral/admin, and airdrop vaults.'),
          },
          {
            eyebrow: t('Purchase lock'),
            value: '14D',
            body: t('Direct-buy tokens are locked per purchase in FourteenToken.'),
          },
          {
            eyebrow: t('Liquidity cadence'),
            value: '6.43%',
            body: t('Controller can release this share once per UTC day.'),
          },
          {
            eyebrow: t('Run threshold'),
            value: '100 TRX',
            body: t('Liquidity execution reverts below controller balance threshold.'),
          },
        ]}
      />

      <ProductSection eyebrow={t('CORE CONTRACTS')} title={t('The contracts and their jobs')}>
        <View style={styles.flatStack}>
          <FlatInfoRow
            eyebrow={t('FourteenToken')}
            title={t('Token, primary buy, locks')}
            body={t('Mints 4TEEN on direct buy, records the 14-day lock, stores token price data, and forwards incoming TRX by fixed split.')}
            accent
          />
          <FlatInfoRow
            eyebrow={t('FourteenController')}
            title={t('Token admin and referrals')}
            body={t('Controls token admin functions and stores ambassador state, buyer binding, reward accounting, and processed purchase IDs.')}
          />
          <FlatInfoRow
            eyebrow={t('FourteenLiquidityController')}
            title={t('Liquidity-side TRX router')}
            body={t('Receives the liquidity share, checks execution conditions, releases 6.43% of balance, then splits the release between DEX executors.')}
            isLast
          />
        </View>
      </ProductSection>

      <ProductSection eyebrow={t('DIRECT BUY FLOW')} title={t('What the chain records')}>
        <View style={styles.flowStack}>
          <FlowStep
            index="01"
            title={t('Buyer sends TRX into FourteenToken')}
            body={t('The contract uses its primary token price to calculate how much 4TEEN should be minted.')}
          />
          <FlowStep
            index="02"
            title={t('4TEEN is minted with a lock')}
            body={t('The buyer receives tokens, but the direct-buy amount is locked for 14 days from the purchase event.')}
          />
          <FlowStep
            index="03"
            title={t('TRX leaves by fixed contract split')}
            body={t('90% goes to LiquidityController, 7% goes to FourteenController, and 3% goes to AirdropVault.')}
          />
          <FlowStep
            index="04"
            title={t('Referral accounting is recorded separately')}
            body={t('FourteenController can bind buyer to ambassador and record a verified purchase once per purchase ID.')}
            isLast
          />
        </View>
      </ProductSection>

      <ProductSection eyebrow={t('AMBASSADOR ENGINE')} title={t('Referral rewards clear in two stages')}>
        <ProductBulletList
          items={[
            t('A buy can be attributed immediately in backend accounting even if the controller-side reward is not on-chain yet.'),
            t('The operator wallet is the wallet that finalizes allocation into FourteenController, so claimable rewards appear only after that contract write succeeds.'),
            t('If resources are low, the backend keeps the purchase in queue, attempts automatic resource rental, and the hourly replay checks again until the allocation lands.'),
          ]}
        />

        <View style={styles.allocationMetaCard}>
          <View style={styles.allocationMetaRow}>
            <Text style={styles.allocationMetaLabel}>{t('Operator wallet')}</Text>
            <Text style={styles.allocationMetaValue}>
              {allocationHealth?.operatorWallet
                ? shortenAddress(allocationHealth.operatorWallet)
                : allocationHealthLoading
                  ? t('Loading...')
                  : t('--')}
            </Text>
          </View>

          <View style={styles.allocationMetaRow}>
            <Text style={styles.allocationMetaLabel}>{t('Queue state')}</Text>
            <Text
              style={[
                styles.allocationMetaValue,
                allocationResourceState?.hasEnough ? styles.allocationMetaValuePositive : styles.allocationMetaValueRisk,
              ]}
            >
              {allocationReadyLabel}
            </Text>
          </View>

          <View style={styles.allocationMetaRowLast}>
            <Text style={styles.allocationMetaLabel}>{t('Safe floor target')}</Text>
            <Text style={styles.allocationMetaValue}>
              {[
                t('{{count}} energy', { count: formatResourceAmount(allocationNeedEnergy) }),
                t('{{count}} bandwidth', { count: formatResourceAmount(allocationNeedBandwidth) }),
              ].join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.runtimeWalletCard}>
          <RuntimeWalletRow
            label={t('Operator wallet')}
            address={operatorRuntime?.wallet || allocationHealth?.operatorWallet || null}
            trxBalance={operatorRuntime?.balanceTrx || '--'}
            energy={operatorRuntime ? formatResourceAmount(operatorRuntime.availableEnergy) : '--'}
            bandwidth={operatorRuntime ? formatResourceAmount(operatorRuntime.availableBandwidth) : '--'}
            note={t('Writes ambassador rewards into FourteenController.')}
          />
          <RuntimeWalletRow
            label={t('Airdrop control')}
            address={airdropControlRuntime?.wallet || null}
            trxBalance={airdropControlRuntime?.balanceTrx || '--'}
            energy={airdropControlRuntime ? formatResourceAmount(airdropControlRuntime.availableEnergy) : '--'}
            bandwidth={airdropControlRuntime ? formatResourceAmount(airdropControlRuntime.availableBandwidth) : '--'}
            note={t('Fallback funding wallet that can top up the operator if rental needs extra TRX.')}
          />
          <RuntimeWalletRow
            label={t('Gas Station deposit')}
            address={gasStationRuntime?.depositAddress || null}
            trxBalance={gasStationRuntime?.balanceTrx || '--'}
            energy={null}
            bandwidth={null}
            details={
              gasStationRuntime?.account
                ? t('provider {{account}} · automatic rental pool', {
                    account: gasStationRuntime.account,
                  })
                : t('Automatic rental pool')
            }
            isLast
          />
        </View>

        {allocationHealthLoading && !allocationHealth ? (
          <View style={styles.assetWalletPlaceholder}>
            <Text style={styles.assetWalletPlaceholderText}>
              {t('Loading live allocation readiness for the ambassador engine...')}
            </Text>
          </View>
        ) : allocationHealth ? (
          <ConfirmNetworkLoadCard
            estimatedEnergy={allocationNeedEnergy}
            estimatedBandwidth={allocationNeedBandwidth}
            availableEnergy={allocationAvailableEnergy}
            availableBandwidth={allocationAvailableBandwidth}
            energyShortfall={allocationEnergyShortfall}
            bandwidthShortfall={allocationBandwidthShortfall}
            message={allocationReadyBody}
            messageRisk={!allocationResourceState?.hasEnough}
          />
        ) : (
          <View style={styles.assetWalletPlaceholder}>
            <Text style={styles.assetWalletPlaceholderText}>
              {allocationHealthError || t('Ambassador allocation status is temporarily unavailable.')}
            </Text>
          </View>
        )}

        <Text style={styles.assetWalletNote}>
          {t(
            'Normal screen opens use cached runtime data. Pull down only when you want to force a live read from the backend and chain.'
          )}
        </Text>
      </ProductSection>

      <ProductSection eyebrow={t('LIQUIDITY MODULE')} title={t('Execution is split into three layers')}>
        <ProductBulletList
          items={[
            t('LiquidityController holds liquidity-side TRX and enforces the minimum balance, once-per-day cadence, and 6.43% release rule.'),
            t('LiquidityBootstrapper prepares executor token balances from FourteenVault before triggering controller execution.'),
            t('JustMoney Executor and Sun.io V3 Executor receive the split TRX release and perform the DEX-specific liquidity calls.'),
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow={t('VAULTS AND ACCOUNTING')} title={t('Where state lives')}>
        <View style={styles.flatStack}>
          <FlatInfoRow
            eyebrow={t('FourteenVault')}
            title={t('Liquidity token reserve')}
            body={t('Provides token-side balances used by the liquidity bootstrapper and executors.')}
            accent
          />
          <FlatInfoRow
            eyebrow={t('AirdropVault')}
            title={t('Airdrop reserve')}
            body={t('Receives the airdrop share from direct buys and keeps community distribution funds separate.')}
          />
          <FlatInfoRow
            eyebrow={t('TeamLockVault')}
            title={t('Team allocation lock')}
            body={t('Keeps team allocation separated from live liquidity and buyer balances.')}
            isLast
          />
        </View>
      </ProductSection>

      <ProductSection eyebrow={t('ASSET WALLETS')} title={t('4TEEN reserves visible on-chain')}>
        <View style={styles.assetWalletStack}>
          {assetWalletsLoading && !assetWallets ? (
            <View style={styles.assetWalletPlaceholder}>
              <Text style={styles.assetWalletPlaceholderText}>
                {t('Loading vault balances and latest 4TEEN deposits...')}
              </Text>
            </View>
          ) : null}

          {assetWallets?.wallets.map((wallet) => (
            <AssetWalletCard
              key={wallet.id}
              wallet={wallet}
              onOpenWallet={() => void openInAppBrowser(router, wallet.explorerUrl)}
              onOpenDeposit={() => {
                if (wallet.lastDeposit?.explorerUrl) {
                  void openInAppBrowser(router, wallet.lastDeposit.explorerUrl);
                }
              }}
            />
          ))}

          {assetWalletsError ? (
            <Text style={styles.assetWalletError}>{assetWalletsError}</Text>
          ) : (
            <Text style={styles.assetWalletNote}>
              {t(
                'Balances are read from 4TEEN balanceOf(). Latest incoming activity uses the newest direct 4TEEN transfer found for the vault address. AirdropVault refills are routed in TRX from direct buys, so that refill timing does not always appear in the same token-transfer list.'
              )}
            </Text>
          )}
        </View>
      </ProductSection>

      <ProductSection eyebrow={t('BOUNDARIES')} title={t('What this system does not promise')}>
        <ProductBulletList
          items={[
            t('No contract guarantees profit or secondary market price growth.'),
            t('The primary direct-buy price is not the same thing as market price.'),
            t('External automation may trigger execution, but contract code defines the rules.'),
            t('On-chain events and contract storage are the source of truth; the app only reads and presents them.'),
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow={t('CONTRACTS')} title={t('Verify the architecture')}>
        <View style={styles.contractList}>
          {CONTRACT_LINKS.map((contract, index) => (
            <TouchableOpacity
              key={contract.label}
              activeOpacity={0.88}
              style={[
                styles.contractRow,
                index === CONTRACT_LINKS.length - 1 && styles.flatRowLast,
              ]}
              onPress={() => void openInAppBrowser(router, contract.url)}
            >
              <View style={styles.contractCopy}>
                <Text style={styles.contractLabel}>{t(contract.label)}</Text>
                <Text style={styles.contractAddress}>{contract.address}</Text>
                <Text style={styles.contractBody}>{t(contract.body)}</Text>
              </View>
              <View style={styles.contractIconBox}>
                <MaterialCommunityIcons name="open-in-new" size={14} color={colors.accent} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ProductSection>
    </ProductScreen>
  );
}

function FlatInfoRow({
  eyebrow,
  title,
  body,
  accent,
  isLast,
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent?: boolean;
  isLast?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.flatRow, isLast && styles.flatRowLast]}>
      <View style={[styles.flatMarker, accent && styles.flatMarkerAccent]} />
      <View style={styles.flatCopy}>
        <Text style={accent ? styles.flatEyebrowAccent : styles.flatEyebrow}>{t(eyebrow)}</Text>
        <Text style={styles.flatTitle}>{t(title)}</Text>
        <Text style={styles.flatBody}>{t(body)}</Text>
      </View>
    </View>
  );
}

function AssetWalletCard({
  wallet,
  onOpenWallet,
  onOpenDeposit,
}: {
  wallet: AssetWalletSnapshotItem;
  onOpenWallet: () => void;
  onOpenDeposit: () => void;
}) {
  const { language, t } = useI18n();
  const isAirdropVault = wallet.id === 'airdrop-vault';

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.assetWalletCard} onPress={onOpenWallet}>
      <View style={styles.assetWalletTopRow}>
        <View style={styles.assetWalletCopy}>
          <Text style={styles.assetWalletLabel}>{wallet.label}</Text>
          <Text style={styles.assetWalletRole}>{t(wallet.role)}</Text>
        </View>
        <MaterialCommunityIcons name="open-in-new" size={16} color={colors.accent} />
      </View>

      <View style={styles.assetWalletBalanceRow}>
        <Text style={styles.assetWalletBalance}>{formatCompactAmount(wallet.balance)}</Text>
        <Text style={styles.assetWalletUnit}>4TEEN</Text>
      </View>

      <Text style={styles.assetWalletAddress}>{shortenAddress(wallet.address)}</Text>

      <TouchableOpacity
        activeOpacity={wallet.lastDeposit ? 0.85 : 1}
        style={styles.assetDepositRow}
        onPress={onOpenDeposit}
        disabled={!wallet.lastDeposit}
      >
        <View style={styles.assetDepositCopy}>
          <Text style={styles.assetDepositLabel}>
            {isAirdropVault ? t('LATEST 4TEEN INCOMING') : t('LATEST 4TEEN DEPOSIT')}
          </Text>
          <Text style={styles.assetDepositValue}>
            {wallet.lastDeposit
              ? `${formatCompactAmount(wallet.lastDeposit.amount)} 4TEEN · ${formatUtc(wallet.lastDeposit.timestamp, language)}`
              : wallet.status === 'unavailable'
                ? t('Temporarily unavailable')
                : isAirdropVault
                  ? t('No direct 4TEEN incoming transfer found')
                  : t('No recent incoming transfer found')}
          </Text>
          {wallet.lastDeposit?.fromAddress ? (
            <Text style={styles.assetDepositFrom}>
              {t('from')} {shortenAddress(wallet.lastDeposit.fromAddress)}
            </Text>
          ) : isAirdropVault ? (
            <Text style={styles.assetDepositFrom}>
              {t('Direct-buy funding reaches this vault as routed TRX, not only as visible 4TEEN transfers.')}
            </Text>
          ) : null}
        </View>

        {wallet.lastDeposit ? (
          <MaterialCommunityIcons name="arrow-top-right" size={15} color={colors.textDim} />
        ) : null}
      </TouchableOpacity>

      {wallet.message ? <Text style={styles.assetWalletWarning}>{wallet.message}</Text> : null}
    </TouchableOpacity>
  );
}

function RuntimeWalletRow({
  label,
  address,
  trxBalance,
  energy,
  bandwidth,
  note,
  details,
  isLast = false,
}: {
  label: string;
  address: string | null;
  trxBalance: string;
  energy: string | null;
  bandwidth: string | null;
  note?: string;
  details?: string;
  isLast?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.runtimeWalletRow, isLast && styles.runtimeWalletRowLast]}>
      <View style={styles.runtimeWalletCopy}>
        <Text style={styles.runtimeWalletLabel}>{t(label)}</Text>
        <Text style={styles.runtimeWalletAddress}>
          {address ? shortenAddress(address) : t('Unavailable')}
        </Text>
        {note ? <Text style={styles.runtimeWalletNote}>{t(note)}</Text> : null}
      </View>

      <View style={styles.runtimeWalletMetrics}>
        <Text style={styles.runtimeWalletMetric}>{trxBalance} TRX</Text>
        <Text style={styles.runtimeWalletMetricSub}>
          {details ? t(details) : (energy !== null && bandwidth !== null
            ? `${energy} energy · ${bandwidth} bandwidth`
            : t('—'))}
        </Text>
      </View>
    </View>
  );
}

function FlowStep({
  index,
  title,
  body,
  isLast,
}: {
  index: string;
  title: string;
  body: string;
  isLast?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.flowStep, isLast && styles.flatRowLast]}>
      <View style={styles.flowIndexBox}>
        <Text style={styles.flowIndex}>{index}</Text>
      </View>
      <View style={styles.flowCopy}>
        <Text style={styles.flowTitle}>{t(title)}</Text>
        <Text style={styles.flowBody}>{t(body)}</Text>
      </View>
    </View>
  );
}

function formatCompactAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '--';

  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(2);
}

function formatUtc(timestamp: number, language: Parameters<typeof getLanguageLocaleTag>[0]) {
  if (!timestamp) return 'UTC --';

  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return 'UTC --';
  }

  return date.toLocaleString(getLanguageLocaleTag(language), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function shortenAddress(address: string) {
  if (!address) return '--';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

const styles = StyleSheet.create({
  allocationMetaCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },

  allocationMetaRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  allocationMetaRowLast: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  allocationMetaLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },

  allocationMetaValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  allocationMetaValuePositive: {
    color: colors.green,
  },

  allocationMetaValueRisk: {
    color: colors.accent,
  },

  runtimeWalletCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },

  runtimeWalletRow: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  runtimeWalletRowLast: {
    borderBottomWidth: 0,
  },

  runtimeWalletCopy: {
    flex: 1,
    gap: 4,
  },

  runtimeWalletLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },

  runtimeWalletAddress: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  runtimeWalletNote: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  runtimeWalletMetrics: {
    alignItems: 'flex-end',
    gap: 3,
  },

  runtimeWalletMetric: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  runtimeWalletMetricSub: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  flatStack: {
    gap: 0,
  },

  flatRow: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 14,
  },

  flatRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },

  flatMarker: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
  },

  flatMarkerAccent: {
    backgroundColor: colors.accent,
  },

  flatCopy: {
    flex: 1,
    gap: 5,
  },

  flatEyebrow: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },

  flatEyebrowAccent: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },

  flatTitle: {
    ...ui.bodyStrong,
  },

  flatBody: {
    ...ui.body,
    color: colors.textSoft,
    lineHeight: 22,
  },

  flowStack: {
    gap: 0,
  },

  flowStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 14,
  },

  flowIndexBox: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,105,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  flowIndex: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  flowCopy: {
    flex: 1,
    gap: 4,
  },

  flowTitle: {
    ...ui.bodyStrong,
  },

  flowBody: {
    ...ui.body,
    color: colors.textSoft,
    lineHeight: 22,
  },

  contractList: {
    gap: 0,
  },

  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 13,
  },

  contractCopy: {
    flex: 1,
    gap: 4,
  },

  contractLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  contractAddress: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  contractIconBox: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(255,105,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  contractBody: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  assetWalletStack: {
    gap: 0,
  },

  assetWalletPlaceholder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 14,
  },

  assetWalletPlaceholderText: {
    ...ui.body,
    color: colors.textSoft,
  },

  assetWalletCard: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 14,
    gap: 10,
  },

  assetWalletTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  assetWalletCopy: {
    flex: 1,
    gap: 3,
  },

  assetWalletLabel: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  assetWalletRole: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  assetWalletBalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },

  assetWalletBalance: {
    color: colors.white,
    fontSize: 27,
    lineHeight: 32,
    fontFamily: 'Sora_700Bold',
  },

  assetWalletUnit: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  assetWalletAddress: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  assetDepositRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 2,
  },

  assetDepositCopy: {
    flex: 1,
    gap: 3,
  },

  assetDepositLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  assetDepositValue: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
  },

  assetDepositFrom: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  assetWalletWarning: {
    color: '#ffb17a',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  assetWalletError: {
    color: '#ff8c7a',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  assetWalletNote: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
