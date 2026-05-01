import AsyncStorage from '@react-native-async-storage/async-storage';

export type DisplayCurrencyCode =
  | 'USD'
  | 'EUR'
  | 'RUB'
  | 'UZS'
  | 'TRY'
  | 'GBP'
  | 'AED'
  | 'KZT'
  | 'INR'
  | 'JPY'
  | 'CNY'
  | 'KRW';

export type DisplayCurrencyOption = {
  code: DisplayCurrencyCode;
  title: string;
  symbol: string;
};

const DISPLAY_CURRENCY_STORAGE_KEY = 'settings.displayCurrency.v1';
const DEFAULT_DISPLAY_CURRENCY: DisplayCurrencyCode = 'USD';

const DISPLAY_CURRENCY_OPTIONS: DisplayCurrencyOption[] = [
  {
    code: 'USD',
    title: 'United States Dollar',
    symbol: '$',
  },
  {
    code: 'EUR',
    title: 'Euro',
    symbol: '€',
  },
  {
    code: 'RUB',
    title: 'Russian Ruble',
    symbol: '₽',
  },
  {
    code: 'UZS',
    title: 'Uzbekistani Som',
    symbol: "so'm",
  },
  {
    code: 'TRY',
    title: 'Turkish Lira',
    symbol: '₺',
  },
  {
    code: 'GBP',
    title: 'British Pound Sterling',
    symbol: '£',
  },
  {
    code: 'AED',
    title: 'UAE Dirham',
    symbol: 'د.إ',
  },
  {
    code: 'KZT',
    title: 'Kazakhstani Tenge',
    symbol: '₸',
  },
  {
    code: 'INR',
    title: 'Indian Rupee',
    symbol: '₹',
  },
  {
    code: 'JPY',
    title: 'Japanese Yen',
    symbol: '¥',
  },
  {
    code: 'CNY',
    title: 'Chinese Yuan',
    symbol: '¥',
  },
  {
    code: 'KRW',
    title: 'South Korean Won',
    symbol: '₩',
  },
];

let displayCurrencyMemory: DisplayCurrencyCode = DEFAULT_DISPLAY_CURRENCY;
let displayCurrencyLoaded = false;
const listeners = new Set<(currency: DisplayCurrencyCode) => void>();

function isDisplayCurrencyCode(value: string): value is DisplayCurrencyCode {
  return DISPLAY_CURRENCY_OPTIONS.some((item) => item.code === value);
}

function notify(currency: DisplayCurrencyCode) {
  for (const listener of listeners) {
    listener(currency);
  }
}

export function getDisplayCurrencyOptions() {
  return DISPLAY_CURRENCY_OPTIONS;
}

export function getDefaultDisplayCurrency() {
  return DEFAULT_DISPLAY_CURRENCY;
}

export function getCachedDisplayCurrency() {
  return displayCurrencyMemory;
}

export function getDisplayCurrencyLabel(currency: DisplayCurrencyCode) {
  return DISPLAY_CURRENCY_OPTIONS.find((item) => item.code === currency)?.title || currency;
}

export function getDisplayCurrencySymbol(currency: DisplayCurrencyCode) {
  return DISPLAY_CURRENCY_OPTIONS.find((item) => item.code === currency)?.symbol || currency;
}

export function subscribeDisplayCurrencyChange(
  listener: (currency: DisplayCurrencyCode) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getDisplayCurrency(): Promise<DisplayCurrencyCode> {
  if (displayCurrencyLoaded) {
    return displayCurrencyMemory;
  }

  try {
    const raw = await AsyncStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    const next = String(raw || '').trim().toUpperCase();

    if (isDisplayCurrencyCode(next)) {
      displayCurrencyMemory = next;
    }
  } catch (error) {
    console.error('Failed to read display currency:', error);
  }

  displayCurrencyLoaded = true;
  return displayCurrencyMemory;
}

export async function setDisplayCurrency(currency: DisplayCurrencyCode): Promise<void> {
  displayCurrencyMemory = currency;
  displayCurrencyLoaded = true;

  try {
    await AsyncStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, currency);
  } catch (error) {
    console.error('Failed to write display currency:', error);
    throw error;
  }

  notify(currency);
}
