export const SUNIO_SMART_ROUTER_ADDRESS = 'TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j';

export function buildSunioRouterExplorerUrl(): string {
  return `https://tronscan.org/#/contract/${SUNIO_SMART_ROUTER_ADDRESS}/code`;
}

export function getSunioSwapDisclosure() {
  return {
    providerName: 'SUN.io',
    providerRoleKey: 'SUN.io is an independent third-party decentralized protocol.',
    custodyKey:
      '4TEEN does not operate SUN.io, act as your counterparty, or take custody of your assets.',
    signatureKey: 'You review and sign every blockchain transaction with your own wallet.',
    routerAddress: SUNIO_SMART_ROUTER_ADDRESS,
    routerExplorerUrl: buildSunioRouterExplorerUrl(),
  } as const;
}
