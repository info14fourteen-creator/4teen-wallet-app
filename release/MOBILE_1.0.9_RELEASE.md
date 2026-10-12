# 4TEEN 1.0.9 release candidate

Prepared 13 October 2026 (Asia/Tashkent) in `codex/ios-account-deletion`. This is a source candidate, **not** an uploaded or published store build.

## Version and baseline

- Marketing version: `1.0.9` in Expo config, mobile package, and in-app version label.
- EAS uses `appVersionSource: remote` and production `autoIncrement: true`. The actual next iOS build number and Android versionCode must be read from completed EAS builds; neither is asserted here. A stale local iOS build number was removed from Expo config.
- Existing store state checked 12–13 October: App Store iOS 1.0.6 (18) Ready for Distribution; TestFlight iOS 1.0.7 (19) Ready to Submit; Google Play 1.0.7 (18) active. The previously queued iOS 1.0.8 (20) predates the corrected BUY route and is not this candidate.
- The 114% startup progress is intentional and preserved. An animated brand mark has been added to the app boot screen; its behavior in a fresh native build still needs verification. The old static splash asset was removed from Expo config, but an existing generated native checkout may still contain it.
- Transaction notes: 120 Unicode characters, encrypted/device-local, shown in wallet and token history. Android persistence was previously checked on an emulator; iOS editor was checked in a simulator without saving a note in the current QA pass.

## Checks

- 160 mobile tests passed on 13 October 2026.
- TypeScript and Expo lint passed.
- iOS and Android Hermes exports passed for the 1.0.9 source candidate. These exports are not signed store binaries.
- `expo config` resolves to version `1.0.9`; `git diff --check` passed.
- EAS CLI is not installed in this workspace. A transient CLI availability check did not complete, so no remote build number or signed binary was created in this pass.

## Required before store submission

1. Finish visual QA of iOS BUY, SWAP, ambassador, airdrop, startup splash, and footer spacing against the Android reference. The current read-only iOS screens are not full functional parity with Android. Do not describe them as native trading or participation flows.
2. Verify a fresh native iOS and Android build, including 114% startup animation and transaction-note save/reopen on test wallets. Do not use personal keys or funds for QA.
3. Confirm EAS source commit, completed binary IDs, actual remote build/version codes, and store metadata. Old 1.0.7/1.0.8 binaries cannot represent this source.
4. Only then upload and submit each platform's correct build; record submission IDs and distinguish review from publication.

## Draft store notes — verify against the final binary

English: "Improved wallet startup and navigation. Transaction notes remain private on your device. Updated the iOS protocol overview and wallet asset screens."

Russian: "Улучшены запуск кошелька и навигация. Заметки к операциям остаются личными и хранятся на устройстве. Обновлены информационные экраны протокола и активов на iOS."
