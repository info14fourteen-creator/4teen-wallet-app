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

export default function AirdropScreen() {
  const router = useRouter();

  return (
    <ProductScreen eyebrow="AIRDROP">
      <ProductHero
        eyebrow="LIVE DISTRIBUTION"
        title="Airdrop is a real distribution layer, not a placeholder."
        body="The 4TEEN airdrop page is already live. This screen gives the native framing first, then drops you into the exact public flow when you need the active Telegram or website-side surface."
      >
        <ProductActionRow
          primaryLabel="Open Airdrop Hub"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ad')}
          secondaryLabel="Open Telegram Flow"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ad/tg')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: 'Allocation',
            value: '1.5M',
            body: 'The airdrop layer is documented as a staged distribution program.',
          },
          {
            eyebrow: 'Waves',
            value: '6',
            body: 'Distribution is structured in release waves instead of a one-shot dump.',
          },
          {
            eyebrow: 'Categories',
            value: '5',
            body: 'The public page groups participation through multiple task layers.',
          },
          {
            eyebrow: 'Entry',
            value: 'Telegram',
            body: 'The live public flow already exposes a Telegram-side path.',
          },
        ]}
      />

      <ProductSection eyebrow="WHAT THIS PAGE SHOULD DO" title="Airdrop needs to feel organized, not noisy">
        <ProductBulletList
          items={[
            'Make it obvious that the airdrop is already live, not “coming soon”.',
            'Separate the explanation layer from the actual Telegram participation path.',
            'Keep the protocol-side language consistent with the rest of the wallet instead of random campaign copy.',
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow="PARTICIPATION FLOW" title="Use the native hub, then jump into the live path">
        <ProductBulletList
          items={[
            'Open the airdrop hub to read the current campaign framing and distribution context.',
            'Open the Telegram flow when you are ready to join the active path.',
            'Return to Earn when you want the broader reward overview again.',
          ]}
        />
        <ProductActionRow
          primaryLabel="Open Telegram Flow"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ad/tg')}
          secondaryLabel="Back to Earn"
          onSecondaryPress={() => router.push('/earn')}
        />
      </ProductSection>
    </ProductScreen>
  );
}
