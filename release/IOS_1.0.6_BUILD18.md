# 4TEEN iOS 1.0.6 (18): wallet deletion remediation

## Reason and scope

Apple rejected 1.0.6 (17) on September 28, 2026 under Guideline 5.1.1(v).
The message requests a discoverable deletion flow and a physical-device video
showing creation/sign-in, navigation to deletion, and completed deletion.
Existing submission: `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`.

The app creates local self-custody wallets, not developer-hosted user accounts.
The existing seven-second Remove Wallet hold was difficult to discover and left
associated address-scoped caches. Both former removal entry points now open one
explicit confirmation screen. Settings also exposes **Delete wallet and data**.
This does not re-enable any restricted iOS exchange/purchase functionality.

## Implemented

- Individual wallet deletion: local key material, wallet registry entry,
  token settings, address-scoped history/portfolio/protocol caches, applicable
  active drafts, and contacts/recent entries matching the deleted address.
- Separate **Delete all wallets and wallet data** option: all registered wallet
  secrets, wallet data/preferences, contacts, drafts and local authentication settings.
- Explicit backup/loss-of-access warning and acknowledgement; exact passcode
  verification if configured, with no development passcode bypass.
- Blockchain addresses, balances and transaction records cannot be erased;
  deletion does not send or burn funds. Unrelated third-party website accounts
  are not developer-hosted wallet accounts and are not deleted by this flow.
- Drain in-flight local storage writes and block late background writes until
  the final application reload. Verify erasure before reporting success; retain
  the wallet registry until secret deletion succeeds and allow failure retries.
- Localized deletion copy in all 16 supported languages.

## Verification

- 123 automated tests passed, including 28 new deletion/screen/translation tests,
  USDT balance regression, iOS navigation restrictions, biometrics and storefront.
- TypeScript and scoped ESLint passed.
- Production Hermes exports for iOS and Android passed. Android is not submitted
  as part of this iOS-only release task.
- Simulator native QA: Settings entry rendered; an individually created empty
  watch-only test record **Deletion QA empty** was deleted through Wallet > More
  > Delete this wallet > backup acknowledgement > Delete this wallet. Success
  rendered. Done completed a real JS reload; the deleted test wallet was absent
  and the two pre-existing watch-only wallets remained visible with balances.
  This is simulator QA, NOT the physical
  device evidence requested by Apple and NOT execution of the store-signed IPA.
- Native iPad simulator QA: Settings entry, wallet list, all-wallet warning,
  disabled-until-acknowledged destructive button and Cancel were verified.
  Cancel returned to the wallet list without deleting the existing watch wallet.
- After the iPhone reload, direct storage inspection confirmed two original
  watch-wallet records remained, the disposable record was absent, and no cache
  key remained for its test address.
- Test record public address: `TCY8FkwpNoSoMswdUsPKLBQKuuJLQibr7V`. No funds or
  signing keys were imported. Its watch-only record is recoverable by importing
  that address again. Existing user wallets were not deleted.

## Submission checkpoint

Source preparation only at this checkpoint. Build/upload/review submission and
physical-device recording are not yet complete. Do not claim this replacement
is on review. iPhone Mirroring requires the user's Mac authentication; the wired
device is currently unavailable. Record only an empty test wallet after access
is restored. Never delete all wallets on a populated personal installation.

The clean release checkout is
`/Users/stanataev/.codex/worktrees/ios-account-deletion/4teen-wallet-app`, branch
`codex/ios-account-deletion`. It excludes unfinished personal notes and unrelated
API/operations work in the main checkout.

## Cloud build started — September 29, 2026

- Source **f3ec3d3c58d0f4b934307ef0c70cb1b141a9796d** is pushed to
  `origin/codex/ios-account-deletion`; the clean source excludes unrelated work.
- EAS build **59352a7f-6b45-4a6e-801d-5dba5b3a8be0**, version **1.0.6 (18)**,
  created **2026-09-29 08:45:37 UTC**. Last observed IN_PROGRESS.
- No App Review submission or physical-device video has been completed yet.

## Build and binary upload — September 29, 2026

- EAS build **59352a7f-6b45-4a6e-801d-5dba5b3a8be0** finished at
  **2026-09-29 08:51:52 UTC**. It is the store-signed iOS **1.0.6 (18)** binary
  from source **f3ec3d3c58d0f4b934307ef0c70cb1b141a9796d**.
- One EAS submission **6d3190e7-5b0c-4416-9073-95696363cb51** completed:
  the binary was uploaded to App Store Connect and Apple began processing it.
  This is not an App Review submission or publication.
- The physical-device video and App Review response are still outstanding.
  `devicectl` reports the AtStan iPhone as unavailable; iPhone Mirroring requires
  Mac authentication. Chrome's Apple session also needs identity verification.

## TestFlight access and review-card checkpoint — September 29, 2026

- Apple login was restored. App Store Connect shows build **18** as `Complete`
  and `Ready to Submit`, Apple build ID
  `8bbe9810-ded9-49cf-a79a-b82c95ed5610`.
- In the rejected iOS 1.0.6 version card, build 17 was detached and build 18
  selected. The UI displayed build 18 and a Save action was initiated, but the
  persisted selection has **not yet been independently rechecked**. The version
  still showed Rejected; no App Review resubmission is claimed.
- The internal TestFlight group `Team (Expo)` contains build 18. The account
  holder `dev4teen@icloud.com` was added as its sole internal tester; the group
  then showed **1 Tester**, status **Invited**. The iPhone install has not yet
  been confirmed. The external `Genesis` group remains unused.
- QuickTime's `Screen > AtStan` source was verified as a physical-iPhone screen
  capture. No video has been recorded or sent. The actual phone contains a
  personal funded wallet, which must not be deleted or shown in review footage.
  Use only a separate disposable empty wallet for the deletion demonstration.

### Corrected TestFlight address

- The user specified `stan.at@icloud.com` as the iPhone's testing Apple ID.
  The existing external `Genesis` group now shows this address as its one
  tester and includes **1.0.6 (18)**. Apple shows the build as **Waiting for
  Review** for external TestFlight testing; it is not installable through that
  external invitation until Apple approves beta distribution.
- The mistaken internal invitation to `dev4teen@icloud.com` was removed from
  `Team (Expo)`, which now shows **0 Testers**. No App Store Connect role or
  security-sensitive access was granted to `stan.at@icloud.com`.
- This is a TestFlight beta-review status, not the rejected App Store version's
  resubmission status. The physical video and App Review response remain open.

## App Review resubmission — September 29, 2026, 15:57 Asia/Tashkent

- Authenticated App Store Connect confirmed the rejected iOS 1.0.6 card had
  persisted **build 18**. Its status was Prepare for Submission and Save was
  disabled before edits.
- App Review Information Notes were extended with the exact wallet-deletion
  path, the local-account model, and an explicit statement that physical-device
  video is not attached. What's New now mentions wallet/local-data deletion.
  Both changes were saved; Update Review became available.
- Update Review placed **1.0.6 (18)** in the existing submission
  `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3` as **Ready for Review**.
- A truthful English reply to Guideline 5.1.1(v) was posted in that submission
  and visibly appeared as the third message. It describes fresh-install setup,
  importing a public watch-only address, Settings > Delete wallet and data,
  confirmation, success, all-wallet deletion, and limitations of local erasure.
  It states that no physical-iPhone recording is attached and asks Apple to
  assess the working in-app path or clarify whether video remains mandatory.
- **Resubmit to App Review** was clicked once. The same submission now visibly
  shows **Waiting for Review**, with item **iOS App 1.0.6 (18)** also
  **Waiting for Review**; Apple lists Date Submitted Sep 29, 2026 at 3:57 PM.
  This is review submission, **not publication or approval**. No video was
  recorded or uploaded. The external TestFlight beta review is separate.
