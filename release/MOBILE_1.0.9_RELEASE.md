# 4TEEN 1.0.9 release candidate

Prepared 13 October 2026 (Asia/Tashkent) in `codex/ios-account-deletion`. **Release blocked by wallet-switch QA finding; do not submit the current binaries for review.**

## Version and baseline

- Marketing version: `1.0.9` in Expo config, mobile package, and in-app version label.
- EAS uses `appVersionSource: remote` and production `autoIncrement: true`. A stale local iOS build number was removed from Expo config. Current target jobs: iOS build `22`, Android versionCode `20`; verify completion before calling them binaries.
- Existing store state checked 12–13 October: App Store iOS 1.0.6 (18) Ready for Distribution; TestFlight iOS 1.0.7 (19) Ready to Submit; Google Play 1.0.7 (18) active. The previously queued iOS 1.0.8 (20) predates the corrected BUY route and is not this candidate.
- The 114% startup progress is intentional and preserved. An animated brand mark has been added to the app boot screen; its behavior in a fresh native build still needs verification. A branded static native splash resource was restored to make signed builds compile; it precedes the in-app animation.
- Transaction notes: 120 Unicode characters, encrypted/device-local, shown in wallet and token history. Android persistence was previously checked on an emulator; iOS editor was checked in a simulator without saving a note in the current QA pass.

## Checks

- 160 mobile tests passed on 13 October 2026.
- TypeScript and Expo lint passed.
- iOS and Android Hermes exports passed for the 1.0.9 source candidate. These exports are not signed store binaries.
- `expo config` resolves to version `1.0.9`; `git diff --check` passed.
- EAS CLI 21.4.0 was available through the local npx cache. Source `fb9f61d` built iOS 1.0.9 (21) successfully but Android 1.0.9 (19) failed in `:app:processReleaseResources`: missing `drawable/splashscreen_logo`. No store upload followed.
- Source `ec29a13` restores a branded native splash image from the existing app icon while the in-app animated mark remains. Android prebuild generated the required density resources. Replacement iOS 1.0.9 (22) `62308356-d284-46b6-86a9-ab1be11c63fc` finished. A single EAS iOS submission `13f010b5-19b4-4afb-9d8f-ad85ec84842c` was scheduled for that build; Apple processing, App Review, and publication remain unverified. Replacement Android 1.0.9 (20) `cf1f5da3-457d-454a-8cbd-7575b348adba` is still running in Gradle at this writing.
- App Store Connect has a single 1.0.9 `Prepare for Submission` card at `/distribution/ios/version/inflight`; no duplicate was created. The English What's New text and corrected App Review notes were saved, replacing stale claims that BUY/SWAP navigation had been removed. Build 22 was selected and saved. **Add for Review has not been used.**
- EAS submission `13f010b5-19b4-4afb-9d8f-ad85ec84842c` uploaded iOS build 22 and Apple processed it to TestFlight `Ready to Submit` (Apple build ID `47cf1adf-ad6a-4d9c-a01e-3dd765ad202a`); this is not App Review or publication. Android build 20 remained `IN_PROGRESS` at the last check; do not upload it to Play.
- Critical simulator finding: after the visible card changed from test wallet `USDT Check` to `4TEEN Demo`, history and transaction details still showed `USDT Check` transactions/address. Build 22/20 predate a source fix for short-swipe snap fallback and mismatched-card masking. The fix passed TypeScript and lint but has **not yet passed simulator regression**. Supersede, do not submit, the old binaries.
- Startup finding reported by the user: the local ignored iOS `SplashScreen.storyboard` still referenced `SplashScreenLegacy`, whose actual image is the unwanted grid and concentric circles. A tracked explicit `expo-splash-screen` plugin configuration now generates a dark, image-free iOS native launch screen while keeping the branded Android splash resource. `expo prebuild --platform ios --no-install` and `ibtool --compile` passed; the generated local storyboard was cleaned of orphan image constraints. The native `ios/` folder is gitignored, so the tracked plugin config is the durable fix. This postdates iOS build 22 and requires a fresh signed build and visual launch check before release.
- `apps/mobile/store.config.json` still references 1.0.6 and its screenshots. Its test fails against app version 1.0.9 (164/165 passing in current run). Reconcile after producing safe current screenshots.

## Required before store submission

1. Finish visual QA of iOS BUY, SWAP, ambassador, airdrop, startup splash, and footer spacing against the Android reference. The current read-only iOS screens are not full functional parity with Android. Do not describe them as native trading or participation flows.
2. Verify a fresh native iOS and Android build, including 114% startup animation and transaction-note save/reopen on test wallets. Do not use personal keys or funds for QA.
3. Confirm EAS source commit, completed binary IDs, actual remote build/version codes, and store metadata. Old 1.0.7/1.0.8 binaries cannot represent this source.
4. Only then upload and submit each platform's correct build; record submission IDs and distinguish review from publication.

## Draft store notes — verify against the final binary

Apple English: "Improved wallet startup and navigation. Transaction notes remain private on your device. Updated the protocol overview and wallet asset screens."

Apple Russian: "Улучшены запуск кошелька и навигация. Заметки к операциям остаются личными и хранятся на устройстве. Обновлены информационные экраны протокола и активов."

Google Play English: "Improved wallet startup and navigation. Transaction notes remain private on your device."

Google Play Russian: "Улучшены запуск кошелька и навигация. Заметки к операциям остаются личными и хранятся на устройстве."

Current local iOS simulator QA screenshots are in `release/screenshots/ios-ui-refresh/`. They are untracked and include a test wallet's public address/balances; they are **not** store-ready and must not be uploaded as-is. BUY/SWAP and participation screens are read-only information on iOS, not native trading or participation flows.
