# iOS release history — verified 2026-09-17

Sources: App Store Connect History, completed App Review submission `b1575c73-9b94-4a66-bc91-51478f32ef1b`, TestFlight build list, EAS build list, local release documents and source. Apple timestamps below are displayed in Asia/Tashkent (UTC+5).

## Confirmed live baseline

- App: 4TEEN, `6795239952`; bundle `me.fourteen.wallet`.
- Version **1.0.5 (14)**, ASC build `cbc307b7-d099-4630-8103-ed742bc354a6`.
- Last submitted September 12 at 20:09; entered review September 15 at 18:18; **Ready for Distribution September 15 at 19:28**.
- Release setting: automatic after approval, not scheduled. The disabled scheduled date is not the selected release policy.
- Approved review notes describe wallet-only iOS, a generic browser without injected wallet signing, and unavailable Swap, Direct Buy, liquidity execution, Ambassador, Airdrop, unlock timeline and Whitepaper.

## Review chronology

| Date | Reviewed build | Actual Apple issue |
| --- | --- | --- |
| Aug 6 | 1.0.5 (2) | 2.1 / 3.1.5(iii): exchange licensing/permissions, regions, third-party relationship/API documentation, AML/KYC, new tokens. |
| Aug 12 | 1.0.5 (2) | Same exchange questions; Guideline 4: Continue hidden after six-digit passcode on iPad. |
| Aug 14 | Not identified in message | 2.1: physical-device walkthrough, test devices/OS, feature/reviewer instructions, services, regional differences and relevant authorization. |
| Aug 17 | 1.0.5 (3) | Exchange documentation still insufficient. |
| Aug 24 | 1.0.5 (10) | Exchange questions still repeated after Swap-only removal. |
| Aug 27, 01:06 (review date Aug 26) | 1.0.5 (12) | 5.1.1(iv): pre-permission camera button must be neutral (Continue/Next), not Allow Camera. |
| Sep 3 | 1.0.5 (13) | 2.3.3: iPad screenshots only showed login; 2.1(a): browser indefinitely loading security verification. |
| Sep 10 | 1.0.5 (14) | 2.3.6: unrestricted browser requires Unrestricted Web Access = Yes. |
| Sep 15 | 1.0.5 (14) | Approved / Ready for Distribution after metadata correction and resubmission. |

No message in this completed review explicitly orders removal of the bottom navigation or prohibits read-only ambassador/history screens. This is not advance approval for reinstating them. The correspondence does not establish that Direct Buy or full reward functionality is permitted.

## Builds are not submissions

TestFlight contains builds **1, 2, 3, 4, 10, 12, 13, 14**, all under 1.0.5. Build 4 was uploaded (SUN.io disclosures according to the source task), but the rejection after that reviewed **build 3**, followed by **build 10**. There is no reviewed-build-4 message in this completed submission.

EAS history:

- Aug 20, build 8: failed preparing credentials.
- Aug 20, build 9: failed signing, Xcode-managed profile incompatible with manual signing settings.
- Aug 20, build 10: finished, `d107cc72-8106-4b71-89c9-220fca577679`.
- Aug 24, build 11: canceled, `d799ddfb-dc50-4c74-b752-3d6540281c15`.
- Aug 24, build 12: finished, `e7f389a6-f8a6-4b8b-86c9-dfd10a6a24ef`.
- Sep 1, build 13: finished, `fd973f58-efd9-4768-97d8-ddeb33fa23de`.
- Sep 7, build 14: finished, `c802294e-ff67-4507-b9f0-11c4473f1e1d`.

EAS FINISHED means the binary was built, not submitted to App Review. TestFlight Ready to Submit refers to beta review and does not contradict the approved App Store version. Each future submission must be verified in Distribution with the exact version/build attached and Waiting for Review shown.

## Reproducibility risks to correct

- EAS builds 8–14 report the same Git revision `70d290ac`, although their uploaded worktrees differed. Git history alone cannot reconstruct those binaries.
- Many release restrictions/platform files are still untracked locally. Preserve them and commit a verified baseline before relying on clean-checkout builds.
- `store.config.json` still says unrestrictedWebAccess=false; Apple required true. Do not reapply stale metadata.
- Older checklists mention build 11 and pending build steps. They are historical, not live status.

## Next update

Target 1.0.6: restore ecosystem navigation and read-only data, with no purchase, exchange, liquidity execution, registration, referral promotion, claim or withdrawal flow on iOS. Preserve all shipped iPad, camera and browser fixes. Submit through **Chrome / App Store Connect**, as requested, and verify the selected build and final submission state there.
