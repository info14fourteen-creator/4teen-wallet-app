import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../src/i18n';
import { ProductScreen } from '../src/ui/product-shell';

import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { isDirectBuyEnabled, isNativeSwapEnabled } from '../src/features/native-swap-access';

export default function TermsScreen() {
  const { t } = useI18n();
  const directBuyEnabled = isDirectBuyEnabled();
  const applicationInterfaces = isNativeSwapEnabled()
    ? 'Direct buy and swap interfaces'
    : 'Wallet send and receive interfaces';
  return (
    <ProductScreen eyebrow={t('TERMS OF SERVICE')} browVariant="backLink">
          <SectionCard
            eyebrow={t('1. Introduction')}
            title={t('Application access and agreement')}
          >
            <Paragraph>
              {t(
                directBuyEnabled
                  ? '4TEEN Wallet is a non-custodial application providing access to blockchain-based tools, token interaction, and ecosystem features.'
                  : '4TEEN Wallet is a non-custodial application for creating or importing wallets, viewing blockchain data, and preparing user-authorized transfers.'
              )}
            </Paragraph>
            <Paragraph>
              {t('By using the application, you agree to these Terms of Service.')}
            </Paragraph>
            <NoteBox>
              {t('Contact: support@4teen.me • +998 95 792 02 87 • https://4teen.me')}
            </NoteBox>
            <NoteBox>
              {'"AG PLUS" Limited Liability Company • TIN 312 696 228 • Registration 3080788 • D-U-N-S 933906683'}
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('2. Nature of the Application')}
            title={t('Interface, not control layer')}
          >
            <RuleList
              t={t}
              items={directBuyEnabled
                ? [
                    'Wallet creation and import',
                    applicationInterfaces,
                    'Unlock timeline and liquidity tracking',
                    'Ambassador and airdrop participation',
                    'Access to external dApps and services',
                  ]
                : [
                    'Wallet creation and import',
                    applicationInterfaces,
                    'Wallet balances and transaction history',
                    'Token information and address tracking',
                    'Access to external websites',
                  ]}
            />

            <Paragraph>
              {t('The application acts as an interface layer. It does not control assets or execute transactions without user authorization.')}
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow={t('3. Non-Custodial Model')}
            title={t('You control your assets')}
          >
            <RuleList
              t={t}
              items={[
                'Private keys are not stored by the application',
                'Funds are not controlled by 4TEEN',
                'Transactions require user approval',
              ]}
            />

            <NoteBox>
              {t('Loss of seed phrase or private keys results in permanent loss of access.')}
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('4. Blockchain Interaction')}
            title={t('Irreversible operations')}
          >
            <RuleList
              t={t}
              items={[
                'Transactions are irreversible',
                'Execution depends on network conditions',
                'Fees and resources are user responsibility',
              ]}
            />

            <Paragraph>
              {t('4TEEN does not guarantee execution, timing, or network availability.')}
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow={t('5. Financial Disclaimer')}
            title={t('No investment guarantees')}
          >
            <RuleList
              t={t}
              items={[
                'Not investment advice',
                'Not a broker, exchange, or custodian',
                'No guarantee of returns',
              ]}
            />

            <NoteBox>
              {t('Market risk remains entirely with the user.')}
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('6. Token and Protocol Risk')}
            title={t('Market behavior is external')}
          >
            <Paragraph>
              {t(
                directBuyEnabled
                  ? 'Token interfaces may display price, liquidity, and conversion data, but these values are not controlled by the application.'
                  : 'Token interfaces may display balances, prices, and public blockchain information, but these values are not controlled by the application.'
              )}
            </Paragraph>

            <Paragraph>
              {t('Market behavior depends on external conditions and participants.')}
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow={t('7. External Services')}
            title={t('Third-party risk')}
          >
            <RuleList
              t={t}
              items={[
                ...(directBuyEnabled ? ['DEX protocols'] : []),
                'External dApps',
                'Websites and social platforms',
              ]}
            />

            <Paragraph>
              {t('4TEEN does not control third-party services.')}
            </Paragraph>
          </SectionCard>

          {directBuyEnabled ? (
            <SectionCardPlain
              eyebrow={t('8. Ambassador and Airdrop')}
              title={t('Participation rules')}
            >
              <RuleList
                t={t}
                items={[
                  'Rewards may be delayed or denied',
                  'Fraud or abuse may lead to exclusion',
                  'Campaign rules may change',
                ]}
              />

              <NoteBox>
                {t('Participation does not guarantee rewards.')}
              </NoteBox>
            </SectionCardPlain>
          ) : (
            <SectionCardPlain
              eyebrow={t('8. Privacy and Security')}
              title={t('Local wallet protection')}
            >
              <RuleList
                t={t}
                items={[
                  'Signing secrets remain on the user device',
                  'Watch-only wallets cannot sign transactions',
                  'Users must protect their recovery information',
                ]}
              />
            </SectionCardPlain>
          )}

          <SectionCard
            eyebrow={t('9. Acceptable Use')}
            title={t('System integrity')}
          >
            <RuleList
              t={t}
              items={directBuyEnabled
                ? [
                    'No exploitation of logic',
                    'No manipulation of rewards',
                    'No interference with protocol behavior',
                  ]
                : [
                    'No exploitation of application logic',
                    'No unauthorized access attempts',
                    'No interference with wallet operation',
                  ]}
            />
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('10. Application State')}
            title={t('Ongoing development')}
          >
            <Paragraph>
              {t('The application is under active development. Features may change, be removed, or behave differently over time.')}
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow={t('11. No Warranties')}
            title={t('Provided as-is')}
          >
            <RuleList
              t={t}
              items={[
                'No uptime guarantees',
                'No accuracy guarantees',
                'No performance guarantees',
              ]}
            />
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('12. Limitation of Liability')}
            title={t('User responsibility')}
          >
            <RuleList
              t={t}
              items={[
                'Loss of funds',
                'Failed transactions',
                'Incorrect inputs',
                'Third-party failures',
              ]}
            />
          </SectionCardPlain>

          <SectionCard
            eyebrow={t('13. Changes to Terms')}
            title={t('Dynamic conditions')}
          >
            <Paragraph>
              {t('Terms may be updated at any time. Continued use implies acceptance.')}
            </Paragraph>
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('14. Final Principle')}
            title={t('Code defines reality')}
          >
            <NoteBox>
              {t('If a behavior is not enforced by code, it is not guaranteed.')}
            </NoteBox>
          </SectionCardPlain>

    </ProductScreen>
  );
}

/* ===== components ===== */

function SectionCard({ eyebrow, title, children }: any) {
  return (
    <View style={styles.sectionCard}>
      <Text style={ui.eyebrow}>{eyebrow}</Text>
      <Text style={ui.titleMd}>{title}</Text>
      <View style={styles.gap}>{children}</View>
    </View>
  );
}

function SectionCardPlain({ eyebrow, title, children }: any) {
  return (
    <View style={styles.sectionCardPlain}>
      <Text style={ui.eyebrow}>{eyebrow}</Text>
      <Text style={ui.titleMd}>{title}</Text>
      <View style={styles.gap}>{children}</View>
    </View>
  );
}

function Paragraph({ children }: any) {
  return <Text style={ui.body}>{children}</Text>;
}

function RuleList({ items, t }: any) {
  return (
    <View style={styles.ruleList}>
      {items.map((i: string) => (
        <View key={i} style={styles.ruleItem}>
          <Text style={ui.body}>{t(i)}</Text>
        </View>
      ))}
    </View>
  );
}

function NoteBox({ children }: any) {
  return (
    <View style={styles.noteBox}>
      <Text style={ui.body}>{children}</Text>
    </View>
  );
}

/* ===== styles ===== */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },

  scroll: { flex: 1 },

  content: {
    paddingBottom: spacing[6],
    gap: spacing[5],
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

  gap: { gap: 14 },

  ruleList: { gap: 10 },

  ruleItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 14,
    backgroundColor: colors.surfaceSoft,
  },

  noteBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    backgroundColor: 'rgba(255,105,0,0.06)',
    padding: 16,
  },
});
