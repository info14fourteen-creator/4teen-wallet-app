# Release Readiness Status

Last checked: 2026-05-02 (Asia/Tashkent)

## Current state

The mobile app is locally release-ready from a code and bundling perspective.

### Verified locally

- `pnpm --dir apps/mobile lint`
- `pnpm --dir apps/api lint`
- `cd apps/mobile && npx tsc --noEmit`
- `cd apps/mobile && npx expo-doctor`
- `cd apps/mobile && npx expo export --platform ios`
- `cd apps/mobile && npx expo export --platform android`
- `git diff --check`

### Release config polish completed

- App icon wired from the current 4TEEN brand mark
- App display name set to `4TEEN`
- Store version set to `1.0.1`
- `ITSAppUsesNonExemptEncryption` declared as `false`
- Removed unused Android `RECORD_AUDIO` permission
- Removed EAS channel config that was noisy without `expo-updates`
- Removed local `ios.buildNumber` / `android.versionCode` from app config because EAS remote versioning is enabled
- Fixed Android Metro bundling for `@noble/hashes` via local shim
- Reworked the Android install-referrer native bridge to a Promise-based Expo module path that is compatible with the current Expo Modules core
- Folded the latest no-wallet entry fixes into the release baseline:
  - wallet-required routes now fall back into `wallet-access`
  - `wallet-access` now uses the onboarding `ui-lab` flow
  - no-wallet language selection is available without exposing the full app shell
  - unlock shield / biometric-entry polish is included

## Referral / attribution readiness

Business-critical referral capture remains wired in the current app flow:

- Android deferred attribution uses the native `install referrer` bridge via `modules/install-referrer`
- iOS fallback capture remains available through launch URL parsing and deferred clipboard/pasteboard capture
- Initial app boot still runs both:
  - `captureReferralFromUrl(initialUrl)`
  - `captureDeferredReferral()`

This means we preserved the referral path instead of only fixing the build.

## Route-level QA checked on iOS simulator

Screens and navigation verified visually:

- Wallet home
- Send
- Swap
- Direct Buy
- Airdrop
- Ambassador
- Control Panel overlay
- Address Book
- Ambassador -> Main navigation

Prepared screenshot pack:

- `release/screenshots-ios-preview/01-wallet-home.png`
- `release/screenshots-ios-preview/02-send.png`
- `release/screenshots-ios-preview/03-swap.png`
- `release/screenshots-ios-preview/04-direct-buy.png`
- `release/screenshots-ios-preview/05-airdrop.png`
- `release/screenshots-ios-preview/06-ambassador.jpg`

See also:

- `release/SCREENSHOT_PLAN.md`

## Store package status

Submission-facing store assets are now prepared as a baseline package:

- `release/STORE_METADATA.md`
- `release/STORE_FIELD_PACK.md`
- `release/APP_REVIEW_NOTES.md`
- `release/SCREENSHOT_CAPTIONS.md`

That means the remaining store work is no longer blocked on writing copy from scratch.

## External blockers only

### Apple / iOS

The Apple ID login and 2FA flow works, but App Store / TestFlight distribution is blocked until the Apple account has access to a paid Apple Developer Program team.

Current blocker:

- no Apple Developer team associated with the authenticated Apple account

### Store pages

Public pages now exist and were verified live:

- `https://4teen.me/privacy`
- `https://4teen.me/terms`
- `https://4teen.me/support`

## Notes

- Older Android cloud builds failed on the install-referrer native module after Metro issues were already fixed:
  - preview `989e96bf-b39a-4d14-b79b-747f6a6d58b4`
  - production `462c039f-fd0d-449e-b34d-0cac6aa09f92`
- That native-module blocker has now been patched locally.
- Fresh Android cloud builds were started from the fixed code path:
  - preview `e5af1822-de4b-4a4b-82c4-4740d158451a`
  - `https://expo.dev/accounts/4teendev/projects/4teen-wallet/builds/e5af1822-de4b-4a4b-82c4-4740d158451a`
  - production `3f8c3adb-da90-40bf-94d4-cf775aa9be78`
  - `https://expo.dev/accounts/4teendev/projects/4teen-wallet/builds/3f8c3adb-da90-40bf-94d4-cf775aa9be78`
- Current fresh-build state when last checked:
  - preview: `NEW`
  - production: `IN_PROGRESS`
- If a cloud build still fails after local exports are green, the next inspection target remains the uploaded EAS job log rather than the local JS app path.
