import { clearAssetWalletsCaches } from './asset-wallets';
import { clearAmbassadorCaches } from './ambassador';
import { clearDirectBuyCaches } from './direct-buy';
import { clearLiquidityControllerCaches } from './liquidity-controller';
import { clearAllTronCaches } from './tron/api';
import { clearUnlockTimelineCaches } from './unlock-timeline';
import { clearAllWalletPortfolioCaches } from './wallet/portfolio';
import { clearWalletResourcePricingCache } from './wallet/resources';
import { clearSendAssetCaches } from './wallet/send';

export async function clearAllAppCaches(): Promise<void> {
  clearAssetWalletsCaches();
  clearDirectBuyCaches();
  clearLiquidityControllerCaches();
  clearUnlockTimelineCaches();
  clearWalletResourcePricingCache();
  clearSendAssetCaches();

  await Promise.all([
    clearAllTronCaches(),
    clearAllWalletPortfolioCaches(),
    clearAmbassadorCaches(),
  ]);
}
