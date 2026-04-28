import { useRouter } from 'expo-router';

import { useI18n } from '../src/i18n';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import {
  ProductActionRow,
  ProductBulletList,
  ProductHero,
  ProductScreen,
  ProductSection,
  ProductSplitRows,
  ProductStatGrid,
} from '../src/ui/product-shell';

export default function Buy4teenScreen() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <ProductScreen eyebrow={t('BUY 4TEEN')}>
      <ProductHero
        eyebrow={t('DIRECT PURCHASE')}
        title={t('Buy 4TEEN through the live contract flow.')}
        body={t(
          'The buy surface is the protocol entry point. You send TRX, 4TEEN is minted directly by contract rules, and the new tokens enter a fixed 14-day lock immediately.'
        )}
      >
        <ProductActionRow
          primaryLabel={t('Open Live Buy')}
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
          secondaryLabel={t('Whitepaper')}
          onSecondaryPress={() => router.push('/whitepaper')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: t('Contract route'),
            value: t('Live'),
            body: t('This uses the real direct-buy widget, not a fake preview.'),
          },
          {
            eyebrow: t('Lock rule'),
            value: '14D',
            body: t('Every direct purchase creates a separate fixed lock entry.'),
          },
          {
            eyebrow: t('TRX split'),
            value: '90 / 7 / 3',
            body: t('Liquidity, controller, and airdrop rails are routed atomically.'),
          },
          {
            eyebrow: t('Price logic'),
            value: t('Primary'),
            body: t('The contract price governs direct buy only, not secondary market price.'),
          },
        ]}
      />

      <ProductSection eyebrow={t('HOW IT WORKS')} title={t('The buy page should answer three questions fast')}>
        <ProductBulletList
          items={[
            t('How much TRX you are committing to the contract-side mint flow.'),
            t('What part of the value goes to liquidity, controller, and airdrop rails.'),
            t('When the purchased 4TEEN becomes transferable after the 14-day lock.'),
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow={t('TRX FLOW')} title={t('Every direct buy routes value by hard rule')}>
        <ProductSplitRows
          rows={[
            {
              eyebrow: '90% TRX',
              title: t('Liquidity System'),
              body: t('Forwarded to the controller side that releases liquidity under explicit execution conditions.'),
              accent: true,
            },
            {
              eyebrow: '7% TRX',
              title: t('Controller Layer'),
              body: t('Used for protocol-side accounting, attribution, and ambassador settlement logic.'),
            },
            {
              eyebrow: '3% TRX',
              title: t('Airdrop Layer'),
              body: t('Reserved for staged ecosystem distribution and public campaign flows.'),
            },
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow={t('NEXT STEP')} title={t('Use the live surface when you are ready')}>
        <ProductBulletList
          items={[
            t('Open the live buy widget for the actual transaction flow.'),
            t('Open unlock timeline right after the purchase if you want immediate lock visibility.'),
            t('Use swap later when the tokens unlock and you want the market route instead of the primary mint route.'),
          ]}
        />
        <ProductActionRow
          primaryLabel={t('Launch Buy Widget')}
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
          secondaryLabel={t('Open Unlock Timeline')}
          onSecondaryPress={() => router.push('/unlock-timeline')}
        />
      </ProductSection>
    </ProductScreen>
  );
}
