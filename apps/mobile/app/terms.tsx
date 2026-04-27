import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ProductScreen } from '../src/ui/product-shell';

import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

export default function TermsScreen() {
  return (
    <ProductScreen eyebrow="TERMS OF SERVICE" browVariant="backLink">
          <SectionCard
            eyebrow="1. Introduction"
            title="Application access and agreement"
          >
            <Paragraph>
              4TEEN Wallet is a non-custodial application providing access to blockchain-based
              tools, token interaction, and ecosystem features.
            </Paragraph>
            <Paragraph>
              By using the application, you agree to these Terms of Service.
            </Paragraph>
            <NoteBox>
              Contact: info@4teen.me • +1 646-217-8070 • https://4teen.me
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow="2. Nature of the Application"
            title="Interface, not control layer"
          >
            <RuleList
              items={[
                'Wallet creation and import',
                'Direct buy and swap interfaces',
                'Unlock timeline and liquidity tracking',
                'Ambassador and airdrop participation',
                'Access to external dApps and services',
              ]}
            />

            <Paragraph>
              The application acts as an interface layer. It does not control assets or execute
              transactions without user authorization.
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow="3. Non-Custodial Model"
            title="You control your assets"
          >
            <RuleList
              items={[
                'Private keys are not stored by the application',
                'Funds are not controlled by 4TEEN',
                'Transactions require user approval',
              ]}
            />

            <NoteBox>
              Loss of seed phrase or private keys results in permanent loss of access.
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow="4. Blockchain Interaction"
            title="Irreversible operations"
          >
            <RuleList
              items={[
                'Transactions are irreversible',
                'Execution depends on network conditions',
                'Fees and resources are user responsibility',
              ]}
            />

            <Paragraph>
              4TEEN does not guarantee execution, timing, or network availability.
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow="5. Financial Disclaimer"
            title="No investment guarantees"
          >
            <RuleList
              items={[
                'Not investment advice',
                'Not a broker, exchange, or custodian',
                'No guarantee of returns',
              ]}
            />

            <NoteBox>
              Market risk remains entirely with the user.
            </NoteBox>
          </SectionCard>

          <SectionCardPlain
            eyebrow="6. Token and Protocol Risk"
            title="Market behavior is external"
          >
            <Paragraph>
              Token interfaces may display price, liquidity, and conversion data, but these values
              are not controlled by the application.
            </Paragraph>

            <Paragraph>
              Market behavior depends on external conditions and participants.
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow="7. External Services"
            title="Third-party risk"
          >
            <RuleList
              items={[
                'DEX protocols',
                'External dApps',
                'Websites and social platforms',
              ]}
            />

            <Paragraph>
              4TEEN does not control third-party services.
            </Paragraph>
          </SectionCard>

          <SectionCardPlain
            eyebrow="8. Ambassador and Airdrop"
            title="Participation rules"
          >
            <RuleList
              items={[
                'Rewards may be delayed or denied',
                'Fraud or abuse may lead to exclusion',
                'Campaign rules may change',
              ]}
            />

            <NoteBox>
              Participation does not guarantee rewards.
            </NoteBox>
          </SectionCardPlain>

          <SectionCard
            eyebrow="9. Acceptable Use"
            title="System integrity"
          >
            <RuleList
              items={[
                'No exploitation of logic',
                'No manipulation of rewards',
                'No interference with protocol behavior',
              ]}
            />
          </SectionCard>

          <SectionCardPlain
            eyebrow="10. Application State"
            title="Ongoing development"
          >
            <Paragraph>
              The application is under active development. Features may change, be removed,
              or behave differently over time.
            </Paragraph>
          </SectionCardPlain>

          <SectionCard
            eyebrow="11. No Warranties"
            title="Provided as-is"
          >
            <RuleList
              items={[
                'No uptime guarantees',
                'No accuracy guarantees',
                'No performance guarantees',
              ]}
            />
          </SectionCard>

          <SectionCardPlain
            eyebrow="12. Limitation of Liability"
            title="User responsibility"
          >
            <RuleList
              items={[
                'Loss of funds',
                'Failed transactions',
                'Incorrect inputs',
                'Third-party failures',
              ]}
            />
          </SectionCardPlain>

          <SectionCard
            eyebrow="13. Changes to Terms"
            title="Dynamic conditions"
          >
            <Paragraph>
              Terms may be updated at any time. Continued use implies acceptance.
            </Paragraph>
          </SectionCard>

          <SectionCardPlain
            eyebrow="14. Final Principle"
            title="Code defines reality"
          >
            <NoteBox>
              If a behavior is not enforced by code, it is not guaranteed.
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

function RuleList({ items }: any) {
  return (
    <View style={styles.ruleList}>
      {items.map((i: string) => (
        <View key={i} style={styles.ruleItem}>
          <Text style={ui.body}>{i}</Text>
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
