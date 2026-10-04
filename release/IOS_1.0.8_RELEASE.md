# iOS 4TEEN 1.0.8 release ledger

Source branch: `codex/ios-account-deletion`. This update restores visible Buy and Swap information pages on iOS, without minting or exchange execution. Android's native transaction screens are unchanged; Android 1.0.7 (18) is already published.

## Pre-build checks

- Buy: live confirmed contract mint records and 4TEEN balances, no transaction submission.
- Swap: live wallet assets and internal history/asset navigation, no quote or exchange connection.
- Direct iOS Buy confirmation redirects to the information page; iOS Swap confirmation redirects to wallet.
- Notes remain private and local on both platforms.
- TypeScript, lint, iOS/Android Hermes export and focused navigation/note tests passed on 4 October 2026. Actual 1.0.8 binary and physical-device visual QA have not yet been verified.

## Store status

- Before creating an App Review submission, verify the current 1.0.6 (18) submission and the processed 1.0.7 (19) build in App Store Connect. Do not duplicate or cancel an existing submission without reason.
- App Store Connect Chrome session currently fails Apple identity verification. A fresh user sign-in/2FA has been requested.
- Do not call an EAS build or binary upload an App Review submission or publication.
