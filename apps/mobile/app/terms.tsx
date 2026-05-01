import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../src/i18n';
import { ProductScreen } from '../src/ui/product-shell';

import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

export default function TermsScreen() {
  const { t } = useI18n();
  return (
    <ProductScreen eyebrow={t('TERMS OF SERVICE')} browVariant="backLink">
          <SectionCard
            eyebrow={t('1. Introduction')}
            title={t('Application access and agreement')}
          >
            <Paragraph>
              {t('4TEEN Wallet is a non-custodial application providing access to blockchain-based tools, token interaction, and ecosystem features.')}
            </Paragraph>
            <Paragraph>
              {t('By using the application, you agree to these Terms of Service.')}
            </Paragraph>
            <NoteBox>
              {t('Contact: info@4teen.me • +1 646-217-8070 • https://4teen.me')}
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow={t('2. Nature of the Application')}
            title={t('Interface, not control layer')}
          >
            <RuleList
              t={t}
              items={[
                'Wallet creation and import',
                'Direct buy and swap interfaces',
                'Unlock timeline and liquidity tracking',
                'Ambassador and airdrop participation',
                'Access to external dApps and services',
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
              {t('Token interfaces may display price, liquidity, and conversion data, but these values are not controlled by the application.')}
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
                'DEX protocols',
                'External dApps',
                'Websites and social platforms',
              ]}
            />

            <Paragraph>
              {t('4TEEN does not control third-party services.')}
            </Paragraph>
          </SectionCard>

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

          <SectionCard
            eyebrow={t('9. Acceptable Use')}
            title={t('System integrity')}
          >
            <RuleList
              t={t}
              items={[
                'No exploitation of logic',
                'No manipulation of rewards',
                'No interference with protocol behavior',
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
