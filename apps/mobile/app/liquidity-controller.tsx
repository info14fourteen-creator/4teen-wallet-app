import { useRouter } from 'expo-router';

import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import {
  ProductActionRow,
  ProductBulletList,
  ProductHero,
  ProductScreen,
  ProductSection,
  ProductStatGrid,
} from '../src/ui/product-shell';

export default function LiquidityControllerScreen() {
  const router = useRouter();

  return (
    <ProductScreen eyebrow="LIQUIDITY CONTROLLER">
      <ProductHero
        eyebrow="ON-CHAIN EXECUTION"
        title="Daily liquidity logic that can actually be inspected."
        body="This page is for protocol visibility. The controller accumulates TRX from direct buys, checks execution conditions, and releases liquidity under explicit rules instead of vague promises."
      >
        <ProductActionRow
          primaryLabel="Open Live Controller"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/lc')}
          secondaryLabel="Whitepaper"
          onSecondaryPress={() => router.push('/whitepaper')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: 'Daily release',
            value: '6.43%',
            body: 'Calculated from controller balance when the execution conditions are met.',
          },
          {
            eyebrow: 'Minimum',
            value: '100 TRX',
            body: 'Execution does not trigger below the threshold.',
          },
          {
            eyebrow: 'Destinations',
            value: 'DEX',
            body: 'The system routes through dedicated execution layers for trading venues.',
          },
          {
            eyebrow: 'Visibility',
            value: 'Events',
            body: 'The live page exposes controller activity through on-chain records.',
          },
        ]}
      />

      <ProductSection eyebrow="EXECUTION FLOW" title="What the controller is responsible for">
        <ProductBulletList
          items={[
            'Receive the liquidity-side TRX routed from direct buys.',
            'Check whether daily execution already happened for the current UTC day.',
            'Release liquidity to execution contracts once conditions are satisfied.',
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow="WHY THIS PAGE EXISTS" title="Liquidity should be inspectable, not guessed">
        <ProductBulletList
          items={[
            'Users can see the controller as its own product surface instead of hearing about it in marketing copy.',
            'The live widget shows execution data without forcing users to manually navigate contract events.',
            'This keeps buy mechanics, unlock visibility, and liquidity logic separated but still connected.',
          ]}
        />
        <ProductActionRow
          primaryLabel="Launch Controller Widget"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/lc')}
          secondaryLabel="Open Buy"
          onSecondaryPress={() => router.push('/buy-4teen')}
        />
      </ProductSection>
    </ProductScreen>
  );
}
