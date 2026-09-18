# iOS 1.0.6 (16) — restoration and token balance fix

Updated: 2026-09-19. Bundle: `me.fourteen.wallet`. Apple app: `6795239952`.

## Scope

- Restore original HOME/EARN animated navigation.
- Read-only ambassador accrual/purchase records, received airdrops, token unlock history and balances, liquidity contract balance, protocol contract addresses.
- BUY/SWAP show an unavailable notice before any signing-wallet access.
- Registration, claim/social tasks, referral promotion/sharing, withdrawals/replays, issuance/purchase and liquidity execution stay unavailable on iOS worldwide.
- Android transaction behavior is retained. On September 19 the user additionally authorized an Android update if affected by the same balance bug; this was confirmed in the shared loader.
- Read USDT/4TEEN balances directly from their contracts, including before TRON account activation. A confirmed zero overrides stale index data; a failed read without an indexed balance must not be cached as zero.
- Unlock balances/history load independently and retain same-wallet data on partial service failure.

## Verification

- 59 Node tests pass, including five balance regressions and fault-injection tests for read-only screens. Balance regressions were verified failing before the fix.
- TypeScript, lint and both iOS/Android production exports pass.
- iPhone UI: wallet, HOME unlock history, ambassador records, airdrop history and blocked BUY/SWAP verified with a public watch-only address. No private keys, approvals, transfers or financial transactions used.
- iPad public watch-only wallet, HOME/EARN records and protocol information verified; updated screenshots uploaded to Apple. iPhone screenshot order still requires final verification.
- iPhone live API/UI verification on the user-supplied public recipient address: USDT 100, TRX 0. No activation or transfer was made. QA screenshot: `/tmp/4teen-usdt-fixed-ios.png` (not storefront media).
- Independent review found and corrected the partial-failure UNLOCK regression. Subsequent API/portfolio review found no Critical/Important issues.
- Published Android 1.0.5 (15), base `d58f075`, the later EAS build 16 base `70d290a`, and iOS base `f36204a` have the identical `api.ts` SHA-1 `541b4de017f0cd21b08afb599988d137d419065d`; the same unactivated-account defect exists on both. Android runtime UI validation remains pending; do not claim it passed. Google Play production version 15 was verified in Chrome on September 19.

## Build and submission

- Previous production build 15: `cce978f8-93af-44c8-b052-0963a5549daf`, fingerprint `443ae82dff6ccb23e21db227c544c36953415d59`. Build and upload completed, but NOT sent to review; superseded because of the USDT defect.
- Replacement iOS build 16: `f4e6c9d8-5148-4102-b1ff-3509ed061338` (EAS production; **FINISHED**). Fingerprint `50b8fc195b5498453c555f61dd317f4d77eb2fa3`.
- Android versionCode 17: `c7384398-b160-4bb9-adf9-90104553f9b0` (1.0.6, EAS production; **FINISHED**). AAB: `https://expo.dev/artifacts/eas/dLGrBw5uKGWIICG-hOEeDdwmFbrYq8s7V4ULwGOaSd0.aab`. Downloaded to `/tmp/4teen-android-release.Tc5GDH/4TEEN-1.0.6-17.aab`; ZIP integrity verified, manifest package `me.fourteen.wallet`, versionName `1.0.6`. SHA-256 `e05398b175e34cb0d36bfab3958ef3b17117faec7e67ecba7ac3acb70300a9eb`.
- Builds began from the complete dirty mobile tree over `f36204a240a1f7d7b4d854758a5b9631e066535d`. Release source is captured in `3d51804`; EAS's base Git SHA alone is not the full archive identity.
- App Store Connect 1.0.6 draft created in Chrome. New review notes and What's New saved; the balance-fix What's New text and disabled Save button were verified in Chrome on September 19.
- Upload of replacement build 16 to Apple: **FINISHED**, no error. EAS submission `bdda4126-3723-4b9b-902e-de0b36bc4909`. Do not upload it again. At 00:32 Tashkent, the Add Build dialog still listed only superseded build 15, which was not selected.
- Submission to App Review: **not yet submitted**. Must attach exact build 16 and verify Waiting for Review in Chrome.
- Release policy: automatic after Apple approval; keep existing rating.
- Release source committed and pushed: `3d51804` on `codex/transfer-pass-mvp`. Unrelated API and operations work remains unstaged/uncommitted. The local pre-commit hook only regenerates a UI build stamp; the release commit preserves the stamp actually included in both uploaded archives.

Metadata source: `apps/mobile/store.config.json`. Prior approved release: 1.0.5 (14).

## Pending console work and continuation

- Apple: after processing, attach **16**, move `02-wallet-assets.png` from last to second in the iPhone screenshot set, verify both screenshot sets and metadata, Add for Review, then submit and verify Waiting for Review. Auto-release after approval is already selected.
- Google Play: production currently has 1.0.5 (15), available in 137 countries/regions. Create Release was clicked and the URL changed to `https://play.google.com/console/u/0/developers/6949134206432640442/app/4973457039495869396/tracks/4697721339032054247/releases/3/prepare`, but the form did not finish rendering. Check this draft before creating another. No new AAB has been uploaded or submitted yet. Preserve countries and existing Android functionality.
- Chrome browser automation returns `Debugger unattached`; native Chrome accessibility can read existing pages and trigger navigation, but subsequent page content stops updating. Login is present, not a confirmed permission problem. User was asked asynchronously to check whether Apple/Google pages load; no reply yet. Do not claim the update is submitted.
- Active thread heartbeat `4teen-1-0-6` checks every 30 minutes and continues the authorized release workflow. Notify only for meaningful progress, submission/publication, failure, or needed user action. Do not restart builds or uploads.
- Android runtime UI verification is still pending. Shared loader regressions and platform capability tests pass; Android production JS export and native cloud build 17 passed. Do not claim an Android emulator UI pass. Final AAB also retains an existing transitive RECORD_AUDIO manifest permission despite expo-camera's `recordAudioAndroid: false`; microphone is not used, and this unrelated pre-existing manifest issue was not changed in this balance patch.

## Token balance root cause

TRC20 funds are recorded in the token contract, not necessarily in an activated TRON account. Both account indexers returned successful empty data while `USDT.balanceOf(recipient)` returned 100000000 base units (100 USDT). The old loader only combined indexer lists and the UI filled a missing default token with zero. Core balances now use read-only `triggerconstantcontract` calls with validated 32-byte uint256 responses and a 15-second timeout. No signing/broadcast endpoint is used. Caches were versioned to avoid carrying the old false-zero snapshot into the update.

Reference: https://developers.tron.network/docs/trc20-contract-interaction
