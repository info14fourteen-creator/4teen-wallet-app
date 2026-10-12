export const APP_VERSION = {
  major: 1,
  minor: 0,
  patch: 9,
  channel: 'release',
  iteration: 1,
};

export const APP_BUILD = {
  buildNumber: '202610130004',
  generatedAtIso: '2026-10-12T19:04:22.000Z',
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  if (channel === 'release' || channel === 'stable') {
    return `${major}.${minor}.${patch}`;
  }

  return `${major}.${minor}.${patch}-${channel}.${iteration}`;
}

export function getVersionDisplayString() {
  return getVersionString().toUpperCase();
}

export function getBuildString() {
  return APP_BUILD.buildNumber;
}

export function getBuildDisplayString() {
  return `BUILD ${getBuildString()}`;
}

export function getGeneratedAtIso() {
  return APP_BUILD.generatedAtIso;
}

export function getFullVersionString() {
  return `${getVersionString()}+${getBuildString()}`;
}

export function getCompactVersionDisplayString() {
  return `${getVersionDisplayString()} · ${getBuildDisplayString()}`;
}
