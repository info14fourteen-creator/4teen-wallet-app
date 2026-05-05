export const APP_VERSION = {
  major: 1,
  minor: 0,
  patch: 3,
  channel: 'release',
  iteration: 1,
};

export const APP_BUILD = {
  buildNumber: '202605051458',
  generatedAtIso: '2026-05-05T09:58:35.285Z',
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
