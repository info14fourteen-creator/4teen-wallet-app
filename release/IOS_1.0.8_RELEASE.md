# iOS 4TEEN 1.0.8 release ledger

Source branch: `codex/ios-account-deletion`. This update restores visible Buy and Swap information pages on iOS, without minting or exchange execution. Android's native transaction screens are unchanged; Android 1.0.7 (18) is already published.

## Pre-build checks

- Buy: live confirmed contract mint records and 4TEEN balances, no transaction submission.
- Swap: live wallet assets and internal history/asset navigation, no quote or exchange connection.
- Direct iOS Buy confirmation redirects to the information page; iOS Swap confirmation redirects to wallet.
- Notes remain private and local on both platforms.
- TypeScript, lint, iOS/Android Hermes export and focused navigation/note tests passed on 4 October 2026. Actual 1.0.8 binary and physical-device visual QA have not yet been verified.

## Store status

- 5 October simulator QA found that `app/buy.ios.tsx` still redirected to the wallet, overriding the intended Buy information screen. The route was fixed locally and verified in a Release-mode simulator build. The previously queued EAS 1.0.8 (20) build predates this fix and must not be submitted as the corrected Buy experience. Swap and corrected Buy simulator captures are in `release/screenshots/ios-1.0.8/`.
- Before creating an App Review submission, verify the current 1.0.6 (18) submission and the processed 1.0.7 (19) build in App Store Connect. Do not duplicate or cancel an existing submission without reason.
- App Store Connect Chrome session currently fails Apple identity verification. A fresh user sign-in/2FA has been requested.
- Do not call an EAS build or binary upload an App Review submission or publication.

## 13 October 2026 build audit

- The 114% boot progress is intentional. A local edit that reduced it to 100% was reverted; the original stage weights, final value, and progress interpolation are preserved. The animated 4TEEN mark is a separate uncommitted UI change and is not present in an existing store binary.
- App Store Connect shows iOS 1.0.6 (18) **Ready for Distribution**. TestFlight lists iOS 1.0.7 (19) **Ready to Submit**; this is a processed build, not a submitted App Review version. No 1.0.8 build was visible in that TestFlight list. The earlier queued 1.0.8 (20) must still be treated as stale because it predates the route fix.
- Google Play App Bundle Explorer shows 1.0.7 (18) active. The console view does not establish that current uncommitted iOS visual changes were built or published on either platform.
- The working tree contains uncommitted changes to the iOS splash/boot UI and read-only product screens; do not submit the old 1.0.7 (19) or 1.0.8 (20) binary as this work. Focused navigation and transaction-note tests: 56 passed. Current iOS and Android Hermes exports passed. New release builds and on-device layout QA remain outstanding.
