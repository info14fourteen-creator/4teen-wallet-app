export const APP_VERSION = {
  major: 0,
  minor: 0,
  patch: 8,
  channel: 'alpha',
  iteration: 10,
};

export const APP_BUILD = {
  buildNumber: '202605012020',
  generatedAtIso: '2026-05-01T15:20:49.642Z',
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
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
