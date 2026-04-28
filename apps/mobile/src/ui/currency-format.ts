import {
  getCachedDisplayCurrency,
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

export function formatDisplayCurrency(
  value?: number,
  options?: FormatCurrencyOptions
) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const currency = resolveCurrency(options?.currency);

  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency,
    notation: options?.notation,
    minimumFractionDigits: options?.minimumFractionDigits,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
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
