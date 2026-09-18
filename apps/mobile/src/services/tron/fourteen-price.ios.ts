export const FOURTEEN_LOGO =
  'https://static.tronscan.org/production/upload/logo/new/TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A.png';

export type FourteenPriceSnapshot = {
  priceInTrx: number;
  priceInUsdt: number;
  logo: string;
  pairBaseAmount: number;
};

export async function getFourteenPriceSnapshot(): Promise<FourteenPriceSnapshot> {
  throw new Error('DEX quote pricing is unavailable on iOS.');
}
