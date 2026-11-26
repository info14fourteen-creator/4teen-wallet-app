# 4TEEN iOS 1.0.11 — Ambassador and Airdrop parity candidate

19 October 2026 (Asia/Tashkent). This is a build candidate, not an App Store submission or publication.

## Change

- iOS `/ambassador-program` and `/airdrop` now render the same screen implementations used by Android instead of the separate read-only protocol views. The iOS ambassador registration and reward-withdrawal confirmation routes also use the Android implementations instead of the unavailable screen.
- The Ambassador screen contains registration/cabinet and reward actions for a signing wallet; the Airdrop screen contains the live Telegram session flow and social claim status. Watch-only restrictions in those shared screens remain intact.
- Marketing version is 1.0.11. EAS remotely incremented the iOS build number from 26 to 27.

## Verification

- TypeScript `npx tsc --noEmit -p apps/mobile/tsconfig.json`: passed.
- `npx expo lint`: passed.
- iOS Hermes export: passed before the version-only bump.
- Existing protocol read-only tests: 23 passed. These cover the older read-only view, not the new iOS route behavior.
- No end-to-end test of signing, Telegram bot handoff, ambassador registration, reward withdrawal, or airdrop claim was performed; no financial transaction was made.
- No App Store submission or metadata/screenshots update was performed.

## EAS build

- iOS 1.0.11 (27), production/store profile: `53c96b9f-a1ff-4b36-a2c4-e95a10cc1ff3`. **Canceled** after discovering the two confirmation-route overrides; this binary must not be distributed.
- Build URL: https://expo.dev/accounts/ag-plus-llc/projects/stan-at/builds/53c96b9f-a1ff-4b36-a2c4-e95a10cc1ff3
- Status after the route audit: `CANCELED`; no release IPA should be used from this build.
- EAS reports Git HEAD `727e17c30a89bdafcc36a11c08ee51cdfb9ba2e9`; the route and version changes were uncommitted working-tree changes at upload time. The Git hash alone does not describe the uploaded working tree.
- Replacement iOS 1.0.11 (28), including the confirmation-route fixes: `ae160451-c7de-48f5-838c-81a1f265ae3b`.
- Build URL: https://expo.dev/accounts/ag-plus-llc/projects/stan-at/builds/ae160451-c7de-48f5-838c-81a1f265ae3b
- Status: `FINISHED`. IPA: https://expo.dev/artifacts/eas/-HnWGPejhTmUoIFmP4ywqF5oavj550TiWX8u85jltho.ipa (HTTP 200 on HEAD). This is the only candidate to evaluate; do not submit build 27.

## 31 October 2026 — BUY parity candidate

- Build 28 is superseded as a release candidate because its iOS BUY remains informational and cannot reach direct-buy confirmation.
- iOS `/buy`, `/buy-confirm`, and `/buy-4teen` now route to the shared direct-buy and confirmation flow instead of the informational/unavailable screens. The service and UI retain the signing-wallet guard and require explicit authentication before a transaction. No financial transaction was performed during verification.
- Added route assertions for BUY, Ambassador, and Airdrop. 168 mobile source tests passed; TypeScript, Expo lint, and iOS Hermes export passed. The stale 1.0.6 Apple storefront fixture test remains unsuitable for 1.0.11 and fails on version mismatch; new storefront metadata and screenshots have not been prepared.
- The iOS simulator was not booted. No physical-iPhone end-to-end check of BUY, Telegram Airdrop, Ambassador registration, or withdrawal has been completed. A passing build is **not** proof of these live flows.
- iOS 1.0.11 (29) EAS production/store build `5fe2c193-06f2-434b-af14-38441092add2` **FINISHED** — https://expo.dev/accounts/ag-plus-llc/projects/stan-at/builds/5fe2c193-06f2-434b-af14-38441092add2 . IPA: https://expo.dev/artifacts/eas/3Rmqvi8wrryWUAlQc2exW1DpZNCrkRds7L1OtEeRE70.ipa (HTTP 200 on HEAD). This is a candidate, not a store upload, review submission, or publication.
- One EAS iOS submission for build 29 was **scheduled** for App Store Connect: `ea16f48c-fbdb-4836-aa39-3fafc8de8f6b` — https://expo.dev/accounts/ag-plus-llc/projects/stan-at/submissions/ea16f48c-fbdb-4836-aa39-3fafc8de8f6b . Successful Apple processing is not yet confirmed. Do not schedule a second upload. This is not an App Review submission or publication.
- Do not submit build 28 or 29 to App Review before device QA, refreshed review notes/screenshots, and evidence that the restored direct-buy operation is permitted in the target App Store regions. The prior iOS storefront copy explicitly says token purchase/issuance is unavailable; it must not be reused with build 29.

## 31 October 2026 — local iOS Release simulator check

- Booted iPhone 17 Pro iOS 26.5 simulator `5CB27BAD-C83D-4ADE-82C7-5DB622D102BF` and locally compiled/installed the current source as a Release app. Xcode reported `Build Succeeded` (0 errors, 3 warnings). The simulator app opened.
- Deep links opened the full Airdrop, Ambassador, and Direct BUY screens. Screenshots were captured under `/tmp/4teen-111-ios-{airdrop2,ambassador,buy}.png` for local QA only; these are not App Store screenshots.
- The simulator contained only a public watch-only wallet. Airdrop displayed `NEEDS WALLET` for Telegram, Ambassador displayed `FULL ACCESS REQUIRED`, and BUY showed `No signing wallet` with Continue disabled. This confirms watch-only guards and route rendering; it **does not verify** signing-wallet data, Telegram bot handoff, direct-buy preparation for a funded wallet, contract execution, ambassador registration, or withdrawal.
- User clarified they view BUY as a contract interaction. The current app and ABI nevertheless call it `direct buy`/`purchase`, and the payable contract function is `buyTokens`; do not tell App Review that no tokens are acquired or that no TRX is spent. A truthful description and review of required documentation are still needed.

## 31 October 2026 — signing-wallet simulator check

- Imported a randomly generated, empty full-access QA wallet into the local iPhone 17 Pro Release simulator. Its secret was not recorded in this journal, and no personal wallet or funds were used.
- Direct BUY selected the QA wallet, loaded a live price of 1.510977 TRX per 4TEEN, and displayed the 14-day lock. With zero TRX, Continue was disabled. No payable contract call was made.
- Airdrop selected the QA wallet and displayed the Telegram card as Available with Connect Now. Instagram showed Not Live. This verifies the signing-wallet view and current empty-state rendering, not Telegram bot handoff or reward claim. A Connect Now tap did not produce a persistent observable change in the simulator, so the external flow remains unverified.
- Ambassador displayed registration, a generated referral slug, and a referral-link preview. Continue opened the shared confirmation screen; it estimated a 10.112 TRX network burn and blocked submission with "Not enough TRX for network burn" for the empty QA wallet. No registration transaction was made.
- Local simulator screenshots: `/tmp/4teen-111-buy-full.png`, `/tmp/4teen-111-airdrop-full.png`, `/tmp/4teen-111-ambassador-full.png`, `/tmp/4teen-111-ambassador-confirm.png`. These are QA artifacts, not App Store screenshots.
- These checks do not validate physical-device behavior, funded-wallet transaction execution, Telegram verification, claim delivery, or reward withdrawal. Build 29 remains a candidate, not confirmed App Review submission or publication.

## 31 October 2026 — App Store processing and review gate

- EAS submission `ea16f48c-fbdb-4836-aa39-3fafc8de8f6b` is `FINISHED` for iOS 1.0.11 (29). `eas submit:status -p ios` confirms Apple processing `VALID`, internal TestFlight `READY_FOR_BETA_TESTING`, external TestFlight `READY_FOR_BETA_SUBMISSION`. This is upload/processing, not App Review submission or publication. The live iOS version is still 1.0.10 (26), `READY_FOR_DISTRIBUTION`.
- App Store Connect in Chrome is accessible for app `6795239952` and shows only the live iOS 1.0.10 version in Distribution; no 1.0.11 version card was visible at this check. The stale `apps/mobile/store.config.json` has version 1.0.6 and review notes saying BUY and reward flows are unavailable; it must not be pushed or reused for build 29.
- Apple App Review Guideline 3.1.5(v) says cryptocurrency apps may not offer currency for completing tasks such as posting to social networks or encouraging downloads. The iOS Telegram Airdrop screen explicitly instructs users to join a Telegram group and channel and verify membership to receive the airdrop. This presents a concrete App Review compliance risk; do not describe it as merely read-only. Guideline 3.1.5(iii)/(iv) and 3.2.1(viii) also make the payable `buyTokens` flow's classification and required permissions material to review. User said no licensing documents are available and considers BUY a contract interaction; that does not by itself settle Apple's classification.
- Before submitting build 29 to App Review, obtain a product/legal decision on the Telegram reward-for-membership and payable BUY features, prepare accurate 1.0.11 metadata/review notes and current screenshots, and complete physical-device QA. Do not submit misleading legacy notes or duplicate the finished EAS upload.

## Before App Store submission

1. Install the resulting IPA through TestFlight or an appropriate device distribution path and verify both screens with a dedicated signing test wallet (no personal funds, keys, or real reward transactions).
2. Check loading, empty/registered Ambassador states, Telegram deep-link return, wallet switching, and social status rendering on iPhone and iPad.
3. Review App Store policy and accurate review notes for the restored interactive functions; refresh screenshots and submit only after device QA.

## 31 October 2026 — build 30 and App Store preparation

- EAS submission `ea16f48c-fbdb-4836-aa39-3fafc8de8f6b` for build 29 finished; Apple processing is `VALID`, internal TestFlight `READY_FOR_BETA_TESTING`. Build 29 has **not** been submitted for App Review.
- On a clean iPhone 17 Pro Max iOS 26.5 simulator with an empty signing QA wallet, Airdrop incorrectly showed `No wallet selected` when its Telegram overview request failed. The local wallet existed in Wallet Management and BUY, so this was a UI load-coupling bug, not proof of a missing wallet. Airdrop now preserves the local wallet and offers a retry state when the overview is unavailable. No claim or financial operation was performed.
- Added regression tests for unavailable overview and no-wallet state. All 170 mobile source tests, TypeScript, and Expo lint passed. This fix is **not** in build 29.
- Replacement iOS 1.0.11 (30) production EAS build `06ef3a9b-29d1-4021-9a0d-6562f3aa1688` **FINISHED** — https://expo.dev/accounts/ag-plus-llc/projects/stan-at/builds/06ef3a9b-29d1-4021-9a0d-6562f3aa1688 . This is the candidate with the Airdrop error-state fix.
- The first EAS metadata push created/updated the 1.0.11 draft and review details but failed on iPhone screenshot `SPEC_MISMATCH` because three candidate iPhone images were 1206×2622 rather than 1320×2868. A second push used two actual iPhone 17 Pro Max simulator captures at 1320×2868 (wallet access and BUY), plus two current-design iPad captures at 2064×2752, and EAS reported `Store configuration is synced with the app stores`. The prior small iPhone candidate files remain local but are no longer referenced.
- One EAS submission for build 30, `08a7db54-2836-46b3-bfcf-13547616be06`, **FINISHED** uploading the binary to App Store Connect — https://expo.dev/accounts/ag-plus-llc/projects/stan-at/submissions/08a7db54-2836-46b3-bfcf-13547616be06 . Apple processing is pending. This is **not** App Review submission or publication. Do not upload the same build again.
- App Store Connect in Chrome eventually loaded the 1.0.11 card: `Prepare for Submission`, with current text and review notes, auto-release after approval selected, and **no build selected yet**. The build 30 must finish Apple processing before selecting it and adding the version for review. Live iOS remains 1.0.10 (26); `eas submit:status` reports `In review: none` at this checkpoint.

## 31 October 2026 — submitted to App Review

- Apple finished processing iOS 1.0.11 (30), Apple build ID `bb1c50c6-4e7a-4da4-ad53-84de781a6ef3`. Build 30, not build 29, was selected and saved on the 1.0.11 version card.
- App Store Connect confirmed `1 Item Submitted` and the submission details show **Waiting for Review** for `iOS App 1.0.11 (30)`, submitted 31 October 2026 at 11:34 PM (as displayed by App Store Connect). Submission ID `455f5f2a-299d-457c-be3e-89155f376fc5`: https://appstoreconnect.apple.com/apps/6795239952/distribution/reviewsubmissions/details/455f5f2a-299d-457c-be3e-89155f376fc5 .
- Automatic release after App Review approval was selected. **This is not approval or publication.** No financial, reward, or funded-wallet end-to-end transaction was performed. The Telegram membership-reward and payable BUY review risks noted above remain; Apple acceptance is not guaranteed.
