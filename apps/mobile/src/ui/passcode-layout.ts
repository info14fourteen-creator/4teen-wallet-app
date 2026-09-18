export type PasscodeLayoutMode = 'regular' | 'compact';

export function getPasscodeLayoutMode(width: number, height: number): PasscodeLayoutMode {
  return width > height || height < 720 ? 'compact' : 'regular';
}

export function getPasscodeContentInsets(
  safeTop: number,
  safeBottom: number,
  mode: PasscodeLayoutMode
) {
  const extra = mode === 'compact' ? 8 : 14;
  const bottomExtra = mode === 'compact' ? 8 : 16;

  return {
    contentPaddingTop: safeTop + extra,
    actionPaddingBottom: safeBottom + bottomExtra,
  };
}
