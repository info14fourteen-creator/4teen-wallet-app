import { useRouter } from 'expo-router';

import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import {
  ProductActionRow,
  ProductHero,
  ProductRouteCard,
  ProductScreen,
  ProductSection,
  ProductStatGrid,
} from '../src/ui/product-shell';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ProductScreen eyebrow="HOME" browVariant="plain">
      <ProductHero
        eyebrow="4TEEN SURFACES"
        title="One place for buy, lock visibility, and liquidity flow."
        body="This home screen is now the clean product hub. Direct buy, unlock timeline, and liquidity controller stay compact here, while each one still opens its full live surface when you need the real widget."
      >
        <ProductActionRow
          primaryLabel="Open Website"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me')}
          secondaryLabel="Whitepaper"
          onSecondaryPress={() => router.push('/whitepaper')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: 'Primary sale',
            value: 'Direct Buy',
            body: 'Mint-on-purchase flow with fixed contract entry and a 14-day lock.',
          },
          {
            eyebrow: 'Visibility',
            value: '14D',
            body: 'Every direct buy is tracked per purchase with unlock countdowns.',
          },
          {
            eyebrow: 'Liquidity',
            value: '6.43%',
            body: 'Controller-side daily release with explicit on-chain conditions.',
          },
          {
            eyebrow: 'Expansion',
            value: 'Earn',
            body: 'Airdrop and ambassador layers live as separate product pages.',
          },
        ]}
      />

      <ProductSection eyebrow="LIVE WIDGETS" title="Main protocol surfaces">
        <ProductRouteCard
          eyebrow="BUY 4TEEN"
          title="Direct purchase with contract-side minting"
          body="Use the full buy surface when you want the real contract flow. The native page explains the mechanics first, then opens the live widget in our browser."
          value="90 / 7 / 3"
          icon="cart-outline"
          primaryLabel="Open Buy Page"
          onPrimaryPress={() => router.push('/buy-4teen')}
          secondaryLabel="Live Surface"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
        />

        <ProductRouteCard
          eyebrow="UNLOCK TIMELINE"
          title="Track locked 4TEEN releases by purchase"
          body="See why a purchase is still locked, when it unlocks, and where the exact on-chain event sits. This is the right place when you need clarity, not guesswork."
          value="14 DAYS"
          icon="timeline-clock-outline"
          primaryLabel="Open Timeline"
          onPrimaryPress={() => router.push('/unlock-timeline')}
          secondaryLabel="Live Surface"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ult')}
        />

        <ProductRouteCard
          eyebrow="LIQUIDITY CONTROLLER"
          title="Follow daily release and execution logic"
          body="Liquidity execution is a real product surface, not a marketing sentence. Open the controller page to see the conditions, event logic, and the live on-chain widget."
          value="100 TRX MIN"
          icon="chart-timeline-variant"
          primaryLabel="Open Controller"
          onPrimaryPress={() => router.push('/liquidity-controller')}
          secondaryLabel="Live Surface"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/lc')}
        />
      </ProductSection>

      <ProductSection eyebrow="EARNING LAYERS" title="Reward and community rails">
        <ProductRouteCard
          eyebrow="EARN"
          title="Airdrop and ambassador flows"
          body="The earn area groups the two external-facing growth flows: airdrop participation and ambassador registration plus cabinet access."
          value="2 FLOWS"
          icon="hand-coin-outline"
          primaryLabel="Open Earn"
          onPrimaryPress={() => router.push('/earn')}
          secondaryLabel="Open Airdrop"
          onSecondaryPress={() => router.push('/airdrop')}
        />
      </ProductSection>
    </ProductScreen>
  );
}
