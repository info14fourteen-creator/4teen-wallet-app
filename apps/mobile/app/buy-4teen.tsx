import { useRouter } from 'expo-router';

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

  return (
    <ProductScreen eyebrow="BUY 4TEEN">
      <ProductHero
        eyebrow="DIRECT PURCHASE"
        title="Buy 4TEEN through the live contract flow."
        body="The buy surface is the protocol entry point. You send TRX, 4TEEN is minted directly by contract rules, and the new tokens enter a fixed 14-day lock immediately."
      >
        <ProductActionRow
          primaryLabel="Open Live Buy"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
          secondaryLabel="Whitepaper"
          onSecondaryPress={() => router.push('/whitepaper')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: 'Contract route',
            value: 'Live',
            body: 'This uses the real direct-buy widget, not a fake preview.',
          },
          {
            eyebrow: 'Lock rule',
            value: '14D',
            body: 'Every direct purchase creates a separate fixed lock entry.',
          },
          {
            eyebrow: 'TRX split',
            value: '90 / 7 / 3',
            body: 'Liquidity, controller, and airdrop rails are routed atomically.',
          },
          {
            eyebrow: 'Price logic',
            value: 'Primary',
            body: 'The contract price governs direct buy only, not secondary market price.',
          },
        ]}
      />

      <ProductSection eyebrow="HOW IT WORKS" title="The buy page should answer three questions fast">
        <ProductBulletList
          items={[
            'How much TRX you are committing to the contract-side mint flow.',
            'What part of the value goes to liquidity, controller, and airdrop rails.',
            'When the purchased 4TEEN becomes transferable after the 14-day lock.',
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow="TRX FLOW" title="Every direct buy routes value by hard rule">
        <ProductSplitRows
          rows={[
            {
              eyebrow: '90% TRX',
              title: 'Liquidity System',
              body: 'Forwarded to the controller side that releases liquidity under explicit execution conditions.',
              accent: true,
            },
            {
              eyebrow: '7% TRX',
              title: 'Controller Layer',
              body: 'Used for protocol-side accounting, attribution, and ambassador settlement logic.',
            },
            {
              eyebrow: '3% TRX',
              title: 'Airdrop Layer',
              body: 'Reserved for staged ecosystem distribution and public campaign flows.',
            },
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow="NEXT STEP" title="Use the live surface when you are ready">
        <ProductBulletList
          items={[
            'Open the live buy widget for the actual transaction flow.',
            'Open unlock timeline right after the purchase if you want immediate lock visibility.',
            'Use swap later when the tokens unlock and you want the market route instead of the primary mint route.',
          ]}
        />
        <ProductActionRow
          primaryLabel="Launch Buy Widget"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
          secondaryLabel="Open Unlock Timeline"
          onSecondaryPress={() => router.push('/unlock-timeline')}
        />
      </ProductSection>
    </ProductScreen>
  );
}
