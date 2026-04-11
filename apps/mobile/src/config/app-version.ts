export const APP_VERSION = {
  major: 0,
  minor: 0,
  patch: 7,
  channel: 'alpha',
  iteration: 1,
};

export const APP_BUILD = {
  commitCount: 20,
  buildNumber: '0020',
};

export function getVersionLabel() {
  return 'Version';
}

export function getVersionString() {
  const { major, minor, patch, channel, iteration } = APP_VERSION;
  return `${major}.${minor}.${patch}-${channel}.${iteration}`;
}

export function getBuildString() {
  return APP_BUILD.buildNumber;
}

export function getCommitCount() {
  return APP_BUILD.commitCount;
}

export function getFullVersionString() {
  return `${getVersionString()}+${getBuildString()}`;
}
