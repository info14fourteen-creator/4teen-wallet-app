import { useRouter } from 'expo-router';

import { useI18n } from '../src/i18n';
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
  const { t } = useI18n();

  return (
    <ProductScreen eyebrow={t('HOME')} browVariant="plain">
      <ProductHero
        eyebrow={t('4TEEN SURFACES')}
        title={t('One place for buy, lock visibility, and liquidity flow.')}
        body={t(
          'This home screen is now the clean product hub. Direct buy, unlock timeline, and liquidity controller stay compact here, while each one still opens its full live surface when you need the real widget.'
        )}
      >
        <ProductActionRow
          primaryLabel={t('Open Website')}
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me')}
          secondaryLabel={t('Whitepaper')}
          onSecondaryPress={() => router.push('/whitepaper')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: t('Primary sale'),
            value: t('Direct Buy'),
            body: t('Mint-on-purchase flow with fixed contract entry and a 14-day lock.'),
          },
          {
            eyebrow: t('Visibility'),
            value: t('14D'),
            body: t('Every direct buy is tracked per purchase with unlock countdowns.'),
          },
          {
            eyebrow: t('Liquidity'),
            value: '6.43%',
            body: t('Controller-side daily release with explicit on-chain conditions.'),
          },
          {
            eyebrow: t('Architecture'),
            value: t('Info'),
            body: t('Contract map, routing rules, vaults, executors, and verification links.'),
          },
        ]}
      />

      <ProductSection eyebrow={t('LIVE WIDGETS')} title={t('Main protocol surfaces')}>
        <ProductRouteCard
          eyebrow={t('BUY 4TEEN')}
          title={t('Direct purchase with contract-side minting')}
          body={t(
            'Use the full buy surface when you want the real contract flow. The native page explains the mechanics first, then opens the live widget in our browser.'
          )}
          value="90 / 7 / 3"
          icon="cart-outline"
          primaryLabel={t('Open Buy Page')}
          onPrimaryPress={() => router.push('/buy-4teen')}
          secondaryLabel={t('Live Surface')}
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
        />

        <ProductRouteCard
          eyebrow={t('UNLOCK TIMELINE')}
          title={t('Track locked 4TEEN releases by purchase')}
          body={t(
            'See why a purchase is still locked, when it unlocks, and where the exact on-chain event sits. This is the right place when you need clarity, not guesswork.'
          )}
          value={t('14 DAYS')}
          icon="timeline-clock-outline"
          primaryLabel={t('Open Timeline')}
          onPrimaryPress={() => router.push('/unlock-timeline')}
          secondaryLabel={t('Live Surface')}
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ult')}
        />

        <ProductRouteCard
          eyebrow={t('LIQUIDITY CONTROLLER')}
          title={t('Follow daily release and execution logic')}
          body={t(
            'Liquidity execution is a real product surface, not a marketing sentence. Open the controller page to see the conditions, event logic, and the live on-chain widget.'
          )}
          value={t('100 TRX MIN')}
          icon="chart-timeline-variant"
          primaryLabel={t('Open Controller')}
          onPrimaryPress={() => router.push('/liquidity-controller')}
          secondaryLabel={t('Live Surface')}
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/lc')}
        />
      </ProductSection>

      <ProductSection eyebrow={t('SYSTEM INFO')} title={t('Blockchain architecture')}>
        <ProductRouteCard
          eyebrow={t('INFO')}
          title={t('Contracts, routing, vaults and executors')}
          body={t(
            'Open the compact architecture map: token, controller, liquidity module, vaults, ambassador accounting, and the Tronscan links needed to verify the system.'
          )}
          value={t('ON-CHAIN')}
          icon="information-outline"
          primaryLabel={t('Open Info')}
          onPrimaryPress={() => router.push('/earn')}
          secondaryLabel={t('Contracts Repo')}
          onSecondaryPress={() =>
            void openInAppBrowser(
              router,
              'https://github.com/info14fourteen-creator/4teen-smart-contracts'
            )
          }
        />
      </ProductSection>
    </ProductScreen>
  );
}
