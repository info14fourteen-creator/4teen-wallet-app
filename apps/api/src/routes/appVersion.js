const express = require('express');
const env = require('../config/env');

const router = express.Router();

function normalizeUrl(value, fallback = '') {
  const next = String(value || fallback || '').trim();
  return next || null;
}

router.get('/app-version', (_req, res) => {
  const fallbackUrl = normalizeUrl(env.APP_UPDATE_FALLBACK_URL, 'https://4teen.me');

  return res.json({
    ok: true,
    latestVersion: String(env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
    minSupportedVersion: String(env.APP_MIN_SUPPORTED_VERSION || env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
    updateUrl: fallbackUrl,
    ios: {
      latestVersion: String(env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
      minSupportedVersion:
        String(env.APP_MIN_SUPPORTED_VERSION || env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
      updateUrl: normalizeUrl(env.APP_IOS_UPDATE_URL, fallbackUrl),
    },
    android: {
      latestVersion: String(env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
      minSupportedVersion:
        String(env.APP_MIN_SUPPORTED_VERSION || env.APP_LATEST_VERSION || '1.0.0').trim() || '1.0.0',
      updateUrl: normalizeUrl(env.APP_ANDROID_UPDATE_URL, fallbackUrl),
    },
  });
});

module.exports = router;
