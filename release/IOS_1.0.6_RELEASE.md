# iOS 1.0.6 (16) — restoration and token balance fix

Updated: 2026-09-26. Bundle: `me.fourteen.wallet`. Apple app: `6795239952`.

**Last verified Apple result: REJECTED — Guideline 2.2 (Beta Testing).** Verified in Chrome on September 23 at 14:29 Asia/Tashkent; Apple's review date is September 21. The rejected item is **1.0.6 (16)** in the existing submission. Apple's sign-in interruption reported on September 25 persists on September 26, so no fresh review result was available. Google Play 1.0.6 (17) was freshly verified published at 100% on September 26. See the rejection analysis below. No replacement build or resubmission is recorded; the local remediation work is not a submitted update.

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
- iPad public watch-only wallet, HOME/EARN records and protocol information verified; updated screenshots uploaded to Apple. Final iPhone order verified 01–10 with `02-wallet-assets.png` second; all nine iPad screenshots verified before submission.
- iPhone live API/UI verification on the user-supplied public recipient address: USDT 100, TRX 0. No activation or transfer was made. QA screenshot: `/tmp/4teen-usdt-fixed-ios.png` (not storefront media).
- Independent review found and corrected the partial-failure UNLOCK regression. Subsequent API/portfolio review found no Critical/Important issues.
- Published Android 1.0.5 (15), base `d58f075`, the later EAS build 16 base `70d290a`, and iOS base `f36204a` have the identical `api.ts` SHA-1 `541b4de017f0cd21b08afb599988d137d419065d`; the same unactivated-account defect exists on both. Android runtime UI validation remains pending; do not claim it passed. Google Play production version 15 was verified in Chrome on September 19.

## Build and submission

- Previous production build 15: `cce978f8-93af-44c8-b052-0963a5549daf`, fingerprint `443ae82dff6ccb23e21db227c544c36953415d59`. Build and upload completed, but NOT sent to review; superseded because of the USDT defect.
- Replacement iOS build 16: `f4e6c9d8-5148-4102-b1ff-3509ed061338` (EAS production; **FINISHED**). Fingerprint `50b8fc195b5498453c555f61dd317f4d77eb2fa3`.
- Android versionCode 17: `c7384398-b160-4bb9-adf9-90104553f9b0` (1.0.6, EAS production; **FINISHED**). AAB: `https://expo.dev/artifacts/eas/dLGrBw5uKGWIICG-hOEeDdwmFbrYq8s7V4ULwGOaSd0.aab`. Downloaded to `/tmp/4teen-android-release.Tc5GDH/4TEEN-1.0.6-17.aab`; ZIP integrity verified, manifest package `me.fourteen.wallet`, versionName `1.0.6`. SHA-256 `e05398b175e34cb0d36bfab3958ef3b17117faec7e67ecba7ac3acb70300a9eb`.
- Builds began from the complete dirty mobile tree over `f36204a240a1f7d7b4d854758a5b9631e066535d`. Release source is captured in `3d51804`; EAS's base Git SHA alone is not the full archive identity.
- App Store Connect 1.0.6 draft created in Chrome. New review notes and What's New saved; the balance-fix What's New text and disabled Save button were verified in Chrome on September 19.
- Upload of replacement build 16 to Apple: **FINISHED**, no error. EAS submission `bdda4126-3723-4b9b-902e-de0b36bc4909`. Do not upload it again. After processing, exact build 16 (Apple build ID `60dd0eea-523a-430f-a093-0a753cbd4a4b`) was attached and saved.
- Submission to App Review: **SUBMITTED — Waiting for Review**, verified in Chrome September 19, 2026 at 00:42 Asia/Tashkent. Submission ID `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`: https://appstoreconnect.apple.com/apps/6795239952/distribution/reviewsubmissions/details/2aed8762-fcbb-4112-9d6e-b2c52b2c29a3 . The submitted item explicitly shows **1.0.6 (16)**.
- Google Play production **1.0.6 (17) SUBMITTED**, verified in Chrome at 00:44 Asia/Tashkent under **Изменения на проверке**. Production release 3; full rollout 100%, existing target countries retained, managed publishing OFF. Preliminary automated checks were still running (up to 14 minutes); if these pass, Google forwards the change automatically. This is not yet approval or publication. Console: https://play.google.com/console/u/0/developers/6949134206432640442/app/4973457039495869396/publishing . No device support loss (0 unsupported devices added). One non-blocking warning: no R8/ProGuard deobfuscation mapping file. Native debug symbols are attached.
- Release policy: automatic after Apple approval; keep existing rating.
- Release source committed and pushed: `3d51804` on `codex/transfer-pass-mvp`. Unrelated API and operations work remains unstaged/uncommitted. The local pre-commit hook only regenerates a UI build stamp; the release commit preserves the stamp actually included in both uploaded archives.

Metadata source: `apps/mobile/store.config.json`. Prior approved release: 1.0.5 (14).

## Review monitoring and continuation

- Apple: monitor the existing submission, whose last verified result is **Rejected**. The original build selection and submission completed successfully, but that does not mean a replacement is under review. Do not create a duplicate submission or select build 15 during monitoring.
- Google Play: production release 3, **1.0.6 (17)**, is published with 100% rollout and no unpublished changes. The existing 137 target countries/regions were not changed. Both English and Russian release notes describe the USDT/4TEEN balance fix.
- Both submissions were completed through Chrome after the user's explicit confirmation. Apple's sign-in interruption was resolved on September 23 when the rejection was read, but a new sign-in interruption was confirmed on September 25. See the latest monitoring entry; do not repeat the same login request while it persists.
- Active thread heartbeat `4teen-1-0-6` checks once daily around **15:24 Asia/Tashkent**, changed at the user's request on September 19. September 26's daily check is complete; the next scheduled check is **September 27, 2026**. Monitor both submitted updates through publication. Notify only for meaningful progress, publication, failure, or needed user action. Do not restart builds, uploads or submissions.
- Android runtime UI verification is still pending. Shared loader regressions and platform capability tests pass; Android production JS export and native cloud build 17 passed. Do not claim an Android emulator UI pass. Final AAB also retains an existing transitive RECORD_AUDIO manifest permission despite expo-camera's `recordAudioAndroid: false`; microphone is not used, and this unrelated pre-existing manifest issue was not changed in this balance patch.

## Monitoring log — 2026-09-19 01:45 Asia/Tashkent

- Google Play: the production `4TEEN 1.0.6 (17)` row remains under **Изменения на проверке**. The earlier running-preliminary-checks message has been replaced by **Изменения находятся на рассмотрении**. No error is displayed; full rollout is queued, managed publishing remains OFF. Last publication is still August 14, so this update is **not yet published**.
- Apple: the existing submission initially displayed **Waiting for Review / 1.0.6 (16)**, but after refresh its detail panel remained loading; a fresh-tab attempt also failed to load the details. A new post-refresh Apple status has not yet been verified. Do not infer rejection, approval or publication from this loading problem.
- No release, build, metadata, review submission or release-policy changes were made. Monitoring remains active.

## Monitoring log — 2026-09-19 02:18 Asia/Tashkent

- **Google Play 1.0.6 (17): PUBLISHED, production rollout 100%.** Chrome's refreshed publishing page displays a September 19 publication notification and no pending changes. The **Тестирование и выпуск** page identifies **4TEEN 1.0.6 (17)** as **Последний рабочий выпуск** with **Процент внедрения 100 %** and says there are no unpublished changes. Publication time was shown relatively as approximately 24 minutes earlier; do not treat that as an exact timestamp. Console: https://play.google.com/console/u/0/developers/6949134206432640442/app/4973457039495869396/test-and-release . Store visibility can take time to propagate to individual users.
- **Apple 1.0.6 (16): Waiting for Review**, re-confirmed after the existing submission's delayed post-refresh load. Submission ID remains `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`. No rejection or request for action is displayed. The temporary loading issue does not imply an Apple rejection.
- Google lists non-blocking next-release UX recommendations for Android 15 edge-to-edge APIs and large-screen orientation/resizability. A separate account notification asks for Android developer-verification app registration by September 30, 2026; its details were not expanded or acted upon in this monitoring run.
- No builds, uploads, submissions, agreements or release-policy changes were made. Continue monitoring Apple until publication; do not repeatedly notify that the already-published Android release is live.

## Monitoring log — 2026-09-19 05:00 Asia/Tashkent

- Fresh navigation to Apple's App Review list confirms submission `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`, **iOS 1.0.6**, **Waiting for Review**. Its existing details still identify build **16**. No new rejection or action request.
- Fresh navigation to Google Play's production track confirms **Active**, latest release **4TEEN 1.0.6 (17)**, **137 countries/regions**. The test-and-release overview still displays **100% rollout** and **no unpublished changes**.
- **Newly observed future remediation warning, not a release rejection:** production build 17 has DEX code optimization below Google's threshold, with **obfuscation 1%**. The Console states that values below **25%** can reduce Play visibility or cause publishing problems and displays a remediation deadline of **February 2027** (no exact day shown). This was read in full and visually verified. Current production remains active; no rebuild or configuration change was made. Notify once and carry this item into planned Android maintenance, rather than treating it as a failed 1.0.6 publication.
- The two existing next-release recommendations (edge-to-edge APIs and large-screen orientation/resizability) remain visible. Crash/ANR metrics have no data; this is not proof of error-free runtime operation.
- Both pages were checked in the existing Chrome tabs through native accessibility. No login, permission or browser-setting change was needed. Restored the user's previously selected tab after checking. Apple monitoring remains active.

## Monitoring attempt — 2026-09-19 14:48 Asia/Tashkent

- **Apple status could not be freshly verified:** the existing Chrome tab was on App Store Connect's login page. Opening the exact submitted review URL again redirected to `/login?...&authResult=FAILED`. The sign-in page did not finish rendering during this check. This is an authentication/access problem, not evidence of rejection or approval; the last verified submission status remains **Waiting for Review**.
- **Google status could not be freshly verified:** reloading the existing test-and-release tab and navigating to the publishing overview changed the page titles/URLs, but page content remained blank in both accessibility and screenshot checks. The last verified production state remains **1.0.6 (17), active, 100% rollout**; do not report this as a new publication check or a store rejection.
- User action requested: reopen App Store Connect in Chrome and sign in again (including any Apple verification). No credentials, permissions, browser settings, code, builds, submissions or release policies were changed. Monitoring remains active. Avoid repeating this access notification while the same condition persists.

## Latest routine check — 2026-09-19 15:22 Asia/Tashkent

- **Access restored.** Chrome now shows the authenticated Apple account. The freshly loaded App Review list confirms the same submission `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`, **iOS 1.0.6**, **Waiting for Review**. No rejection or new request is displayed. The initial TestFlight metadata page also identified **1.0.6 (16)** as validated; validation alone is not App Review approval.
- Google Play's freshly loaded **Тестирование и выпуск** overview explicitly confirms **4TEEN 1.0.6 (17)** as the latest production release, **100% rollout**, and **no unpublished changes**. The previously documented next-release recommendations remain visible.
- Native Chrome accessibility lagged during navigation; direct Chrome tab accessibility successfully returned the loaded store pages. The prior login request is no longer blocking, and no further user action is needed. No credentials, permissions, settings, code, builds, uploads or submissions were changed; the user's previously selected tab was restored.
- No release-state change. Monitoring remains active; no repeat publication/warning notification.

## Daily monitoring — 2026-09-20 15:26 Asia/Tashkent

- **Apple requires sign-in again.** The existing Chrome tab displayed the Apple Account sign-in form. Opening the exact submission URL redirected to `/login?...&authResult=FAILED`, and the sign-in form rendered with an empty account field. A current review result could not be verified. The last confirmed result is September 19's **Waiting for Review**; do not infer a rejection, approval or publication from an expired session. User action: sign in to App Store Connect in Chrome and complete any Apple verification. This is a new access interruption after yesterday's restored access; notify once, then suppress repeats if unchanged.
- Fresh Chrome navigation to Google Play's **Тестирование и выпуск** confirms **4TEEN 1.0.6 (17)** remains the latest production release, **100% rollout**, and **no unpublished changes**. Crash/ANR data remains unavailable; the previously documented recommendations are still present. No repeat Android publication notification is needed.
- No builds, uploads, submissions, agreements, credentials, permissions, code or release policies were changed. Daily monitoring remains active. The existing Apple sign-in tab is retained for user handoff.

## Access restored — 2026-09-20 15:28 Asia/Tashkent

- After the user signed in, the exact submission details in Chrome confirmed **1.0.6 (16)**, submission `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`, **Waiting for Review**. The submission is queued, not yet **In Review**; no rejection or new action request is displayed.
- Today's Apple login blocker is resolved. No repeat submission or other release change was made. Continue the existing daily monitoring schedule.

## Daily monitoring — 2026-09-21 15:35 Asia/Tashkent

- **Apple sign-in is required again after September 20's restored access.** The current Chrome tab showed the Apple Account login form. Opening the exact submission URL redirected to `/login?...&authResult=FAILED`. The current review result could not be verified; the last confirmed status is **1.0.6 (16), Waiting for Review**, on September 20 at 15:28. This authentication failure does not establish rejection, approval or publication.
- Fresh navigation within Google Play confirms **4TEEN 1.0.6 (17)** is still the latest production release with **100% rollout** and **no unpublished changes**. No new release-blocking error is displayed; the existing recommendations remain. Do not repeat the Android publication or DEX warning notification.
- Notify the user once to sign in to App Store Connect in Chrome and complete any Apple verification. Keep the existing Apple login tab for handoff; suppress repeated notifications while this same access interruption remains unresolved. Daily monitoring stays active. No builds, uploads, submissions, code, permissions, agreements or release policies were changed.

## Daily monitoring — 2026-09-22 15:28 Asia/Tashkent

- **Apple's previously reported sign-in interruption persists.** Opening the exact existing submission URL in Chrome again redirected to `/login?...&authResult=FAILED`; the Apple Account sign-in form rendered with an empty account field. Today's review result could not be verified. The last confirmed status remains **1.0.6 (16), Waiting for Review**, on September 20 at 15:28. Do not infer rejection, approval or publication from this authentication problem.
- Reloading Google Play's **Тестирование и выпуск** overview confirms **4TEEN 1.0.6 (17)** remains the latest production release, with **100% rollout** and **no unpublished changes**.
- No new release-state change was established. Suppress the duplicate Apple sign-in request and Android publication notification. The existing Apple login tab is retained for handoff; daily monitoring remains active. No builds, uploads, submissions, code, credentials, permissions, agreements or release policies were changed.

## Apple rejection analysis — 2026-09-23 14:29 Asia/Tashkent

- The authenticated Chrome submission displays **Unresolved Issues**, **Rejected**, and **2.2.0 Performance: Beta Testing** for **1.0.6 (16)**. Submission ID remains `2aed8762-fcbb-4112-9d6e-b2c52b2c29a3`. Apple's review date is **September 21, 2026**, on **iPad Air 11-inch (M3)**. The single Apple message was read in full.
- Apple's stated concern is visible content/features, specifically **swap**, that users cannot use in this version. The requested remedy is to complete, remove, or fully configure partially implemented features. No additional licensing/SUN.io/USDT issue is listed in this message; absence of another objection is not approval of those features.
- Attachment **Screenshot-0921-120236.png** was downloaded and visually inspected. It shows the fingerprint-setup screen, the visible **SWAP** bottom-navigation item, and the notice **This operation is unavailable in the iOS app.** This supports the disabled-feature diagnosis; the screenshot does not establish a biometric failure.
- The release source confirms the cause: `native-swap-access.ts` explicitly returns `swap-unavailable` with the **SWAP** label on iOS. `footer-nav.tsx` renders this item and its press handler displays the unavailable notice. The same footer also renders a **BUY** entry whose iOS handler displays that notice. The current tests assert this placeholder behavior, so passing them did not establish App Review readiness.
- Recommended remediation: remove unavailable exchange/purchase entry points from the iOS user interface while keeping functional navigation and genuinely working read-only sections; audit all visible controls and storefront screenshots. Keep iOS execution restrictions intact and Android behavior unchanged. This is an interface/build correction, not a reason to enable swap or conceal it from reviewers. A replacement iOS build and explicit review notes will be needed after implementation and QA; approval is not guaranteed.
- This turn performed diagnosis and documentation only. No app code, builds, store metadata, submissions, release policy, or Apple messages were changed. The rejection is being reported to the user; suppress repeat notifications of this same known result in subsequent monitoring checks.

## Daily monitoring — 2026-09-25 15:30 Asia/Tashkent

- **Apple requires sign-in again after September 23's restored access.** The Chrome tab displayed the Apple Account login form. Navigating to the exact existing submission redirected to `/login?...&authResult=FAILED`; the form rendered with an empty account field. Today's result and any new Apple messages could not be checked. The last verified result remains **1.0.6 (16), Rejected under Guideline 2.2**, as already explained to the user on September 23; this authentication interruption is not a new rejection.
- Fresh navigation to Google Play's **Тестирование и выпуск** overview confirms **4TEEN 1.0.6 (17)** as the latest production release, **100% rollout**, and **no unpublished changes**. Existing next-release recommendations remain; no repeat Android publication/DEX alert is needed.
- Request one user sign-in to App Store Connect in Chrome, including any Apple verification, and retain the existing tab for handoff. Suppress repeat requests while this same interruption persists. Daily monitoring remains active.
- This monitoring run did not alter application code or resume the incomplete September 23 remediation. No build, upload, store metadata edit, submission, agreement, credential, permission or release-policy change was made. Partial local edits must not be described as a finished or submitted replacement.

## Daily monitoring — 2026-09-26 15:44 Asia/Tashkent

- **The same Apple sign-in interruption persists.** Fresh navigation to the existing submission in Chrome again redirected to `/login?...&authResult=FAILED`, followed by the empty Apple Account sign-in form. No current review result or new Apple messages could be read. The last verified result is the already-reported **1.0.6 (16) rejection under Guideline 2.2** from September 23; do not present it as a newly verified status or a new rejection.
- Reloading Google Play's **Тестирование и выпуск** overview confirms **4TEEN 1.0.6 (17)** remains the latest production release, **100% rollout**, and **no unpublished changes**. Existing recommendations remain, and crash/ANR data is unavailable rather than evidence of zero errors.
- No new notification is needed: the login action was requested on September 25, and the Android publication and Apple rejection are already known. The existing Apple tab is retained for login handoff. Daily monitoring continues. No code, build, upload, submission, metadata, agreement, credential, permission or release-policy change was made.

## Android developer verification — user-requested check on 2026-09-19

- On the account's **Проверка разработчика Android** page, **4TEEN / me.fourteen.wallet** already displayed **Зарегистрировано**, one key, last updated **July 16, 2026**. Its package details displayed the key status **Подтверждено**. The generic September 30 registration reminder is not evidence that this package is unregistered.
- The identification tab uses **AG PLUS, MCHJ**, Tashkent, Uzbekistan from the existing Play developer account. The account page showed the website, contact email and phone, and public developer email/phone as verified. No new documents, registrations, keys or agreements were submitted.
- Registered key fingerprint: `42:F5:E3:CB:49:F8:88:02:D6:87:A0:B1:81:6F:FE:66:C4:2A:CB:D2:A6:F4:E0:4B:B0:84:C2:B1:97:81:0F:4E`. This check does not establish registration of any additional signing keys used outside Google Play.

## Token balance root cause

TRC20 funds are recorded in the token contract, not necessarily in an activated TRON account. Both account indexers returned successful empty data while `USDT.balanceOf(recipient)` returned 100000000 base units (100 USDT). The old loader only combined indexer lists and the UI filled a missing default token with zero. Core balances now use read-only `triggerconstantcontract` calls with validated 32-byte uint256 responses and a 15-second timeout. No signing/broadcast endpoint is used. Caches were versioned to avoid carrying the old false-zero snapshot into the update.

Reference: https://developers.tron.network/docs/trc20-contract-interaction

## Replacement build preparation — 2026-09-26

- Apple access was restored and the original rejection was read again in authenticated Chrome: **1.0.6 (16), Guideline 2.2**, same submission and one Apple message. No replacement has yet been submitted at this checkpoint.
- Commit `a2529c2` replaces iOS SWAP/BUY placeholder controls with working ASSETS/history navigation, keeps HOME and existing read-only records, filters the unavailable whitepaper redirect from iOS search, updates all sixteen translations, and adds behavioral navigation tests. Android SWAP/BUY and watch-only signing restrictions remain unchanged.
- Commit `ae68457` also fixes the biometric setup primary button: when biometrics are unavailable, **Continue Without Biometrics** advances while retaining passcode protection. Five behavioral tests cover unsupported/unenrolled hardware, successful/cancelled authentication, and retaining an existing biometric setting.
- The clean release checkout is `/Users/stanataev/.codex/worktrees/ios-review-22/4teen-wallet-app`, at `2d4f3bfe39e8c5afd23cfda8fd71c7bdf1c2bc5d` (equivalent to the two scoped main-checkout commits). Unfinished transaction-note changes and unrelated API/ops work are excluded.
- TypeScript, scoped lint, the original 90 regression tests and five new biometric tests passed. Production Hermes exports for iOS and Android passed; the final iOS export including biometric correction also passed. Native iPhone QA confirmed balances, receive QR, token history, ASSETS, HOME unlock records and ambassador history. iPad QA and final media upload are still pending at this checkpoint.
- First EAS attempt failed on a GraphQL connection before project upload. The subsequent attempt uploaded the clean project and created exactly one new build: **1.0.6 (17)**, EAS ID `8eedc030-51e2-48be-99a6-c426e606d2a6`, created **2026-09-26 11:40:11 UTC**, status **IN_PROGRESS**. Build URL: https://expo.dev/accounts/ag-plus-llc/projects/stan-at/builds/8eedc030-51e2-48be-99a6-c426e606d2a6
- Four new iPhone screenshots are being prepared under `apps/mobile/store/apple/screenshot/1.0.6-build17/APP_IPHONE_67`. Do not retain old screenshots showing rejected SWAP/BUY placeholder navigation. No App Store upload or resubmission is claimed yet.

## Replacement upload and storefront — 2026-09-26 21:00 Asia/Tashkent

- EAS build `8eedc030-51e2-48be-99a6-c426e606d2a6` completed successfully at **11:46:10 UTC**, producing **1.0.6 (17)** from clean commit `2d4f3bfe39e8c5afd23cfda8fd71c7bdf1c2bc5d`.
- The first upload command failed on an Expo GraphQL connection before scheduling. The retry created EAS submission `b7626136-4ade-4b6c-874e-8c5e104c40b1` and confirmed the binary was successfully uploaded to Apple. Chrome's TestFlight **Build Uploads** now shows **1.0.6 (17), Processing**, created **September 26, 2026, 20:58 Asia/Tashkent**. This is binary upload, not App Review submission.
- Native iPad QA confirmed wallet balances, receive QR, token history, HOME unlock records and public contract information. iPhone and iPad UI checks used the existing native Debug binary with the clean replacement JavaScript; they do not constitute execution of the cloud-signed IPA. No financial transactions were made.
- Four actual iPhone screenshots (1320×2868) and four iPad screenshots (2048×2732) were captured and uploaded in Chrome. Verified order for both: **wallet → receive → token history → unlock records**. All other iPhone/iPad sizes inherit this new media; no separate old SWAP/BUY screenshots remain in those groups. Old local assets were retained.
- Updated What's New and App Review notes were saved in App Store Connect, including the working ASSETS/history navigation and biometric continuation correction. Automatic release after approval remains selected. Android was not uploaded or modified.
- Re-ran all **95 regression tests**, including the updated storefront asset checks: all passed. Only release metadata, its tests, screenshots and this log are being committed at this stage; preserve the build's existing source/version stamp rather than regenerating it for a metadata-only commit.
- Build 16 is still attached to the rejected version at this checkpoint. Wait for processing, select build 17, and explicitly resubmit before reporting **Waiting for Review**.
