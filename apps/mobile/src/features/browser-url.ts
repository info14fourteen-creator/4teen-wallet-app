const EMBEDDED_SCHEMES = ['http://', 'https://', 'about:blank'];
const EXTERNAL_SCHEMES = ['mailto:', 'tel:', 'sms:', 'tronlinkoutside://', 'intent://'];

export function normalizeBrowserUrl(input?: string | string[] | null) {
  const raw = Array.isArray(input) ? input[0] : input;

  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  if ([...EMBEDDED_SCHEMES, ...EXTERNAL_SCHEMES].some((scheme) => trimmed.startsWith(scheme))) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function shouldOpenExternally(url: string) {
  return EXTERNAL_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function canOpenInEmbeddedBrowser(url: string) {
  return EMBEDDED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function getReadableDomain(url: string, fallbackLabel: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || fallbackLabel;
  }
}

export function getBrowserAddressLabel(url: string | null, fallbackLabel: string) {
  return url ? getReadableDomain(url, fallbackLabel) : fallbackLabel;
}
