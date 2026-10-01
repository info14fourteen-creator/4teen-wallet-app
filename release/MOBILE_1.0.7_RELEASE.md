# 4TEEN 1.0.7 release ledger

Source commit: `6f01ee8cee8819a05bf3a33ef58fd9466d0f2bec` on `codex/ios-account-deletion`.

## Scope

- Private, local transaction notes (up to 120 characters) on wallet and token history, on iOS and Android.
- Notes are stored in native secure storage and removed when the final local wallet for their address is deleted.
- iOS preserves the product-style wallet UI and read-only protocol overview, while native BUY/SWAP remain gated pending platform permissions. Android retains its existing flows.

## Verification, 1 October 2026

- TypeScript, Expo lint, and 157 mobile tests passed.
- iOS and Android production JavaScript/Hermes export passed.
- Android 1.0.7 debug build installed on a separate emulator QA user. Saved a note and verified that it persisted after force stop/restart. No signing or transaction was performed.
- iOS note UI was visually checked on a simulator in the prior QA pass. This is not a physical-device release validation.

## Build and store status

- iOS EAS production build `ba30736f-0ff6-416d-ba5a-8cba1a1b66e3`: version `1.0.7 (19)`, finished. EAS submission `873a05f4-92ba-4896-b6c3-b08206212a51` was scheduled; successful App Store Connect processing and App Review submission are not yet verified.
- Android EAS production build `95b05cca-f7af-4890-9ab9-fd3546eab42c`: version `1.0.7 (18)`, queued at the time of this entry. Not uploaded to Google Play yet.
- App Store Connect session currently requires sign-in. Check existing iOS 1.0.6 (18) review status before submitting 1.0.7; do not mistake a completed EAS build for App Review submission.
- Google Play 1.0.6 (17) remains the last confirmed published Android release.
