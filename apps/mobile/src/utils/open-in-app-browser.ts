import { Linking } from 'react-native';
import type { Router } from 'expo-router';

function normalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return 'https://4teen.me';
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('sms:') ||
    trimmed.startsWith('tronlinkoutside://') ||
    trimmed.startsWith('intent://')
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function shouldOpenExternally(url: string) {
  return (
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('sms:') ||
    url.startsWith('tronlinkoutside://') ||
    url.startsWith('intent://')
  );
}

export async function openInAppBrowser(router: Router, rawUrl: string) {
  const url = normalizeUrl(rawUrl);

  if (shouldOpenExternally(url)) {
    await Linking.openURL(url);
    return;
  }

  router.push({
    pathname: '/browser',
    params: { url },
  } as any);
}
