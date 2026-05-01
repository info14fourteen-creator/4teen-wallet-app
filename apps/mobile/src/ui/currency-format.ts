import {
  getCachedDisplayCurrency,
  getDisplayCurrencySymbol,
  type DisplayCurrencyCode,
} from '../settings/display-currency';

type FormatCurrencyOptions = {
  currency?: DisplayCurrencyCode;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  notation?: 'standard' | 'compact';
};

function resolveCurrency(code?: DisplayCurrencyCode) {
  return code || getCachedDisplayCurrency();
}

function applyPreferredCurrencySymbol(
  formatted: string,
  currency: DisplayCurrencyCode,
  preferredSymbol: string
) {
  const normalized = formatted.trim();
  const replacementMap: Record<DisplayCurrencyCode, string[]> = {
    USD: ['US$', 'USD'],
    EUR: ['EUR'],
    RUB: ['RUB', 'RUR', 'руб.'],
    UZS: ['UZS'],
    TRY: ['TRY', 'TL'],
    GBP: ['GBP'],
    AED: ['AED'],
    KZT: ['KZT'],
    INR: ['INR'],
    JPY: ['JPY'],
    CNY: ['CNY', 'CN¥'],
    KRW: ['KRW'],
  };

  for (const token of replacementMap[currency] || []) {
    if (normalized.includes(token)) {
      return normalized.replace(token, preferredSymbol);
    }
  }

  return normalized;
}

export function formatDisplayCurrency(
  value?: number,
  options?: FormatCurrencyOptions
) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const currency = resolveCurrency(options?.currency);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: options?.notation,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: options?.minimumFractionDigits,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
  const preferredSymbol = getDisplayCurrencySymbol(currency);
  const formatted = formatter.format(safe);
  return applyPreferredCurrencySymbol(formatted, currency, preferredSymbol);
}

export function formatAdaptiveDisplayCurrency(
  value?: number,
  options?: Omit<FormatCurrencyOptions, 'notation'>
) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safe);

  if (absolute >= 100000) {
    return formatDisplayCurrency(safe, {
      ...options,
      notation: 'compact',
      maximumFractionDigits: 2,
    });
  }

  return formatDisplayCurrency(safe, {
    ...options,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
}

export function formatCompactDisplayCurrency(
  value?: number,
  currency?: DisplayCurrencyCode
) {
  return formatDisplayCurrency(value, {
    currency,
    notation: 'compact',
    maximumFractionDigits: 2,
  });
}

export function formatSignedDisplayCurrency(
  value?: number,
  currency?: DisplayCurrencyCode
) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  if (Math.abs(safe) < 0.0000001) {
    return formatDisplayCurrency(0, {
      currency,
      maximumFractionDigits: 2,
    });
  }

  const sign = safe > 0 ? '+' : '-';
  return `${sign}${formatDisplayCurrency(Math.abs(safe), {
    currency,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAdaptiveSignedDisplayCurrency(
  value?: number,
  currency?: DisplayCurrencyCode
) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  if (Math.abs(safe) < 0.0000001) {
    return formatAdaptiveDisplayCurrency(0, {
      currency,
      maximumFractionDigits: 2,
    });
  }

  const sign = safe > 0 ? '+' : '-';
  return `${sign}${formatAdaptiveDisplayCurrency(Math.abs(safe), {
    currency,
    maximumFractionDigits: 2,
  })}`;
}
