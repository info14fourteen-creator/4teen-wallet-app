export const APP_VERSION = {
  major: 0,
  minor: 0,
  patch: 7,
  channel: 'alpha',
  iteration: 1,
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  return `${major}.${minor}.${patch}-${channel}.${iteration}`;
}
