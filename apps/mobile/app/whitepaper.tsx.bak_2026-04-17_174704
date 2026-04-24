import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

const toc = [
  'Abstract',
  'Introduction',
  'Token Overview',
  'Supply Model',
  'Price Logic',
  'Token Locking',
  'TRX Flow on Purchase',
  'Liquidity Architecture',
  'Liquidity Execution Logic',
  'DEX Executors',
  'Liquidity Automation',
  'Ambassador System',
  'Vault Architecture',
  'Governance & Permissions',
  'Frontend Disclaimer',
  'Security Considerations',
  'What 4TEEN Is Not',
  'Verification',
];

const summaryCards = [
  { overline: 'Token', stat: '4TEEN', text: 'TRC-20 token on TRON with 6 decimals.' },
  { overline: 'Primary Entry', stat: 'Mint', text: 'New tokens are created only through direct contract purchases.' },
  { overline: 'Lock Rule', stat: '14D', text: 'Every direct purchase is locked for a fixed 14-day period.' },
  { overline: 'Liquidity Rule', stat: '6.43%', text: 'Daily controller release, at most once per UTC day.' },
];

export default function WhitepaperScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} onSearchPress={() => router.push('/search-lab')} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <SubmenuHeader title="4TEEN WHITEPAPER" onBack={() => router.back()} />

          <View style={styles.heroCard}>
            <Text style={ui.eyebrow}>4TEEN Whitepaper</Text>
            <Text style={styles.metaGreen}>Version 1.3 • March 28, 2026</Text>
            <Text style={ui.titleLg}>Vision, Technology, Economics, and On-Chain Mechanics</Text>
            <Text style={ui.lead}>
              4TEEN is a modular TRON token protocol built around mint-on-purchase issuance, a fixed 14-day lock,
              controller-based ownership, scheduled liquidity execution, GitHub Actions–based liquidity automation,
              and a full-stack ambassador operations system.
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <View key={card.overline} style={styles.summaryCard}>
                <Text style={ui.muted}>{card.overline}</Text>
                <Text style={styles.stat}>{card.stat}</Text>
                <Text style={ui.body}>{card.text}</Text>
              </View>
            ))}
          </View>

          <CardPlain>
            <Text style={ui.eyebrow}>Table of Contents</Text>
            <Text style={ui.titleSm}>Read the protocol in one pass</Text>

            <View style={styles.tocGrid}>
              {toc.map((item) => (
                <View key={item} style={styles.tocItem}>
                  <Text style={ui.tocLabel}>{item}</Text>
                </View>
              ))}
            </View>
          </CardPlain>

          <SectionCard
            eyebrow="Abstract"
            title="A modular on-chain token system with explicit rules and separated operating layers."
          >
            <Text style={ui.body}>
              4TEEN is a TRON-based token protocol designed around transparent, mechanical behavior.
              Its core rules are enforced by smart contracts, not by discretionary interpretation.
            </Text>
            <Text style={ui.body}>
              The system combines a TRC-20 token contract, a dedicated liquidity controller,
              DEX-specific executor contracts, purpose-separated vaults, GitHub Actions–based liquidity automation,
              and a full-stack ambassador reward system centered around controller-side settlement.
            </Text>
            <HighlightBox title="Scope of this document">
              This whitepaper describes the current deployed state of the 4TEEN system. It is a technical
              and structural specification, not a promise of market outcome.
            </HighlightBox>
            <NoteBox>
              The 4TEEN token itself does not generate profit. Market price depends on liquidity and demand.
              Algorithmic price growth applies only to direct contract purchases and does not control secondary market trading.
            </NoteBox>
          </SectionCard>

          <SectionCardPlain eyebrow="1. Introduction" title="The protocol is built to be inspectable, not interpreted.">
            <Text style={ui.body}>
              4TEEN is an on-chain token mechanism with deliberately narrow and explicit functionality.
              Its purpose is to create a transparent, verifiable framework for token issuance, transfer restriction,
              liquidity formation, attribution, and staged ecosystem distribution, all enforced by code.
            </Text>
            <Text style={ui.body}>
              Unlike custodial or off-chain systems, 4TEEN does not rely on vague promises, hidden bookkeeping,
              or informal operator discretion for its core behavior.
            </Text>
          </SectionCardPlain>

          <SectionCard eyebrow="2. Token Overview" title="Fourteen Token (4TEEN)">
            <MiniTable
              rows={[
                ['Name', 'Fourteen Token'],
                ['Symbol', '4TEEN'],
                ['Blockchain', 'TRON'],
                ['Standard', 'TRC-20'],
                ['Decimals', '6'],
                ['Issuing Time', 'November 23, 2025 (UTC)'],
              ]}
            />
            <SoftCard
              title="What the token does"
              items={[
                'Issues tokens on deployment and on direct purchase.',
                'Tracks balances and transfer allowances.',
                'Creates and enforces per-purchase locks.',
                'Routes incoming TRX according to hardcoded split rules.',
              ]}
            />
            <SoftCard
              title="What the token does not do"
              items={[
                'It does not interact with DEXes directly.',
                'It does not depend on price oracles.',
                'It does not manage liquidity positions.',
                'It does not guarantee market price behavior.',
              ]}
            />
          </SectionCard>

          <SectionCardPlain eyebrow="3. Supply Model" title="Hybrid supply with on-demand expansion">
            <SoftCard
              title="Initial Supply"
              body="At deployment, 10,102,022 4TEEN were minted to the owner side of the system. This initial supply is visible on-chain and was created only once."
            />
            <SoftCard
              title="Mint-on-Purchase Issuance"
              body="New 4TEEN are minted only when a user calls buyTokens() and sends TRX to the token contract."
            />
            <RuleList
              items={[
                'No periodic emissions',
                'No staking rewards',
                'No yield-based minting',
                'No burn mechanism',
              ]}
            />
            <NoteBox>
              Supply integrity is contract-enforced. The system does not allow arbitrary owner minting,
              retroactive balance edits, or silent redistribution of user-held tokens.
            </NoteBox>
          </SectionCardPlain>

          <SectionCard eyebrow="4. Price Logic" title="Primary sale price only">
            <HighlightBox title="Base purchase price at deployment:">
              1 TRX = 1 4TEEN
            </HighlightBox>
            <RuleList
              items={[
                'Annualized growth rate: 14.75%',
                'Compounding interval: 90 days',
                'Updates are applied lazily when queried or when a purchase occurs',
              ]}
            />
            <Text style={ui.body}>
              This mechanism affects only the amount of 4TEEN minted through the contract purchase flow.
              It does not set, stabilize, or predict secondary market price.
            </Text>
          </SectionCard>

          <SectionCardPlain eyebrow="5. Token Locking Mechanism" title="Per-purchase locks enforced on-chain">
            <Text style={ui.body}>
              Every direct purchase through buyTokens() creates a separate lock entry for the buyer address.
              Each lock lasts for a fixed 14 days from the block timestamp of the purchase.
            </Text>
            <CodeBlock>available balance = total balance − locked balance</CodeBlock>
            <SoftCard
              title="No administrative override"
              items={[
                'No early owner unlock',
                'No emergency unlock function',
                'No privileged role with lock-control power',
              ]}
            />
          </SectionCardPlain>

          <SectionCard eyebrow="6. TRX Flow on Purchase" title="Every direct buy routes value atomically by rule">
            <SplitCard overline="90% TRX" title="Liquidity System" body="Forwarded to FourteenLiquidityController for scheduled release and DEX execution flow." accent />
            <SplitCard overline="7% TRX" title="Controller Layer" body="Forwarded to FourteenController for control, attribution, reward accounting, and ambassador settlement logic." />
            <SplitCard overline="3% TRX" title="Airdrop Layer" body="Forwarded to AirdropVault for staged ecosystem distribution and campaign infrastructure." />
          </SectionCard>

          <SectionCardPlain eyebrow="7. Liquidity Architecture" title="A two-layer liquidity model">
            <SoftCard
              title="Layer One — FourteenToken"
              items={[
                'Receives TRX from direct purchases',
                'Routes 90% to the liquidity system',
                'Does not store liquidity funds long-term',
                'Does not interact with DEXes directly',
              ]}
            />
            <SoftCard
              title="Layer Two — FourteenLiquidityController"
              items={[
                'Accumulates TRX forwarded by the token contract',
                'Releases liquidity at most once per UTC day',
                'Calculates release amount from current balance',
                'Dispatches funds to DEX executors',
              ]}
            />
          </SectionCardPlain>

          <SectionCard eyebrow="8. Liquidity Execution Logic" title="Daily release with hard conditions">
            <RuleList
              items={[
                'Execution has not already occurred for the current UTC day',
                'Controller balance meets the minimum threshold of 100 TRX',
                'A valid on-chain execution call is made',
              ]}
            />
            <HighlightBox title="Daily release amount:">
              6.43% of the controller’s current TRX balance
            </HighlightBox>
          </SectionCard>

          <SectionCardPlain eyebrow="9. DEX Executors" title="Exchange-specific execution, isolated from core logic">
            <SoftCard
              title="LiquidityExecutorSunV3"
              items={[
                'Reads current pool price from Sun.io V3',
                'Calculates token amount dynamically',
                'Adds liquidity in a concentrated-liquidity format',
              ]}
            />
            <SoftCard
              title="LiquidityExecutorJustMoney"
              items={[
                'Reads reserve balances from the pool',
                'Calculates proportional token amount',
                'Adds liquidity through the AMM router',
              ]}
            />
          </SectionCardPlain>

          <SectionCardPlain eyebrow="10. Liquidity Automation" title="Automation keeps the system moving. The contract still decides what is allowed.">
            <Text style={ui.body}>
              The 4TEEN liquidity automation repository is the external execution layer responsible for running the daily liquidity operation.
              It does not define policy and it does not loosen contract-side constraints.
            </Text>
            <RuleList
              items={[
                'Checks execution availability',
                'Calls bootstrapAndExecute()',
                'Waits for transaction confirmation',
                'Publishes the execution result',
              ]}
            />
            <CodeBlock>{`{
  "ok": true,
  "result": "SUCCESS",
  "txid": "transaction_hash"
}`}</CodeBlock>
          </SectionCardPlain>

          <SectionCard eyebrow="11. Ambassador System" title="A full-stack acquisition, attribution, and reward settlement system.">
            <Text style={ui.body}>
              The 4TEEN Ambassador System is a multi-layer operating system for ambassador identity,
              first-touch attribution, purchase verification, backend allocation, cabinet visibility,
              and on-chain reward settlement.
            </Text>
            <SoftCard
              title="Reward Ladder"
              items={[
                'Bronze: 0–9 buyers → 10%',
                'Silver: 10–99 buyers → 25%',
                'Gold: 100–999 buyers → 50%',
                'Platinum: 1000+ buyers → 75%',
              ]}
            />
          </SectionCard>

          <SectionCardPlain eyebrow="12. Vault Architecture" title="Purpose-separated reserve custody">
            <SoftCard title="FourteenVault" body="Stores tokens reserved for liquidity provisioning." />
            <SoftCard title="TeamLockVault" body="Stores team allocation under separate custody and lock-oriented logic." />
            <SoftCard title="AirdropVault" body="Stores community and growth reserves for staged ecosystem distribution." />
          </SectionCardPlain>

          <SectionCard eyebrow="13. Governance & Permissions" title="Administrative powers are explicit and limited">
            <SoftCard
              title="What ownership can do"
              items={[
                'Update annual purchase price growth rate',
                'Update liquidity-related addresses',
                'Update designated airdrop address',
              ]}
            />
            <SoftCard
              title="What ownership cannot do"
              items={[
                'Mint tokens arbitrarily',
                'Force-unlock user locks',
                'Edit user balances retroactively',
                'Manipulate secondary market prices',
              ]}
            />
          </SectionCard>

          <SectionCardPlain eyebrow="14. Frontend Disclaimer" title="The frontend is an interface, not the source of truth">
            <Text style={ui.body}>
              The frontend may display balances, locked and available amounts, countdown timers,
              estimated conversion rates, transaction history, and live state summaries.
            </Text>
            <NoteBox>
              If frontend output and on-chain state ever differ, on-chain state is authoritative.
            </NoteBox>
          </SectionCardPlain>

          <SectionCard eyebrow="15. Security Considerations" title="Security by separation, constraints, and deterministic execution">
            <RuleList
              items={[
                'Critical operations are deterministic and either execute fully or revert.',
                'Token, controller, executors, vaults, and operating layers are intentionally separated.',
                'There are no hidden admin backdoors for arbitrary minting or silent balance editing.',
              ]}
            />
          </SectionCard>

          <SectionCardPlain eyebrow="16. What 4TEEN Is Not" title="Clarifications against misreading">
            <SoftCard title="Not an investment product" body="4TEEN does not promise returns, guaranteed appreciation, profit sharing, or exposure to off-chain revenue." />
            <SoftCard title="Not yield-bearing" body="There are no staking rewards, no interest, and no passive income mechanics tied to simply holding the token." />
            <SoftCard title="Not price-controlled" body="The protocol does not stabilize secondary market price." />
            <SoftCard title="Not risk-free" body="Users still face smart contract risk, market volatility, liquidity limitations, and external dependency risk." />
          </SectionCardPlain>

          <SectionCard eyebrow="17. Verification" title="The system is strongest when it can be checked from multiple angles.">
            <SoftCard
              title="Core verification routes"
              items={[
                'Public TRON explorer pages for token, controller, liquidity, and vault contracts',
                'Open repositories for smart contracts, wallet kit, ambassador system, liquidity automation, and Telegram airdrop bot',
                'Whitepaper, tokenomics, and blog as the public reading layer',
              ]}
            />
            <NoteBox>
              If a behavior is not explicitly described here and not enforced by deployed code,
              it is not defined by the 4TEEN protocol.
            </NoteBox>
          </SectionCard>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

function CardPlain({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCardPlain}>{children}</View>;
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={ui.eyebrow}>{eyebrow}</Text>
      <Text style={ui.titleMd}>{title}</Text>
      <View style={styles.sectionGap}>{children}</View>
    </View>
  );
}

function SectionCardPlain({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCardPlain}>
      <Text style={ui.eyebrow}>{eyebrow}</Text>
      <Text style={ui.titleMd}>{title}</Text>
      <View style={styles.sectionGap}>{children}</View>
    </View>
  );
}

function HighlightBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.highlightBox}>
      <Text style={ui.bodyStrong}>{title}</Text>
      <Text style={ui.body}>{children}</Text>
    </View>
  );
}

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.noteBox}>
      <Text style={ui.body}>{children}</Text>
    </View>
  );
}

function RuleList({ items }: { items: string[] }) {
  return (
    <View style={styles.ruleList}>
      {items.map((item) => (
        <View key={item} style={styles.ruleItem}>
          <Text style={ui.body}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SoftCard({
  title,
  body,
  items,
}: {
  title: string;
  body?: string;
  items?: string[];
}) {
  return (
    <View style={styles.softCard}>
      <Text style={ui.titleSm}>{title}</Text>
      {body ? <Text style={ui.body}>{body}</Text> : null}
      {items ? <RuleList items={items} /> : null}
    </View>
  );
}

function SplitCard({
  overline,
  title,
  body,
  accent = false,
}: {
  overline: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.splitCard, accent && styles.splitCardAccent]}>
      <Text style={ui.muted}>{overline}</Text>
      <Text style={ui.titleSm}>{title}</Text>
      <Text style={ui.body}>{body}</Text>
    </View>
  );
}

function MiniTable({ rows }: { rows: string[][] }) {
  return (
    <View style={styles.tableWrap}>
      {rows.map(([left, right], index) => (
        <View key={left} style={[styles.tableRow, index === rows.length - 1 && styles.tableRowLast]}>
          <Text style={ui.muted}>{left}</Text>
          <Text style={styles.tableRight}>{right}</Text>
        </View>
      ))}
    </View>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <Text style={styles.codeBlock}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    gap: spacing[5],
  },

  heroCard: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,105,0,0.06)',
    padding: 20,
    gap: 14,
  },

  metaGreen: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  summaryGrid: {
    gap: 12,
  },

  summaryCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
    gap: 6,
  },

  stat: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },

  sectionCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 10,
  },

  sectionCardPlain: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
    gap: 10,
  },

  sectionGap: {
    gap: 16,
  },

  highlightBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.18)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,105,0,0.08)',
    padding: 16,
    gap: 6,
  },

  noteBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    backgroundColor: 'rgba(255,105,0,0.06)',
    padding: 16,
  },

  ruleList: {
    gap: 10,
  },

  ruleItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
  },

  softCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
    gap: 10,
  },

  splitCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
    gap: 8,
  },

  splitCardAccent: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderColor: 'rgba(255,105,0,0.18)',
  },

  tableWrap: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSoft,
  },

  tableRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    gap: 6,
  },

  tableRowLast: {
    borderBottomWidth: 0,
  },

  tableRight: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 22,
  },

  codeBlock: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: colors.white,
    fontSize: 13,
    lineHeight: 22,
  },

  tocGrid: {
    gap: 10,
    marginTop: 12,
  },

  tocItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
  },
});
