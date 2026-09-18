type Translate = (key: string) => string;

export function getCameraPermissionCopy(translate: Translate) {
  return {
    title: translate('Camera access required'),
    body: translate('Allow camera access to scan wallet addresses and QR codes.'),
    actionLabel: translate('Continue'),
  };
}
