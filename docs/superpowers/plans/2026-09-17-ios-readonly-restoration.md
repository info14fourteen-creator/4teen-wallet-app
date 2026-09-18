# iOS read-only restoration implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved scope inline. The user authorized implementation and submission through Chrome without another design gate.

**Goal:** Restore the recognizable bottom navigation and useful protocol/account history without reintroducing restricted transaction functions on iOS.

**Architecture:** Keep Android transaction routes intact. Separate navigation visibility from transaction capability. iOS routes render isolated read-only screens. Restricted Buy/Swap entries give an explicit availability notice; they never invoke signing, provider sites or redirects into a transaction flow. Read-only loaders never request wallet secrets.

**Tech stack:** Existing Expo 54 / React Native / Expo Router / TypeScript / node:test.

**Spec:** User-approved staged plan in the current task; evidence in `release/IOS_RELEASE_HISTORY_2026-09-17.md`.

## Global constraints

- Preserve all local changes and the shipped iPad, browser and camera fixes.
- Native Swap, Direct Buy, new ambassador registration, reward withdrawal/replay, referral promotion and social claim flows remain unavailable on iOS.
- No post-review activation, remote switch or dApp shortcut to restricted functionality.
- Show real data, loading/error/empty states; do not turn network failure into zero balances.
- Use Chrome to select the new build and submit the App Store update. EAS upload alone is not a submission.

## Tasks

- [x] Verify actual released build, rejection history and uploaded build list in Chrome.
- [x] Snapshot existing mobile worktree before implementation.
- [x] Update capability tests: iOS HOME/EARN navigation is available while transaction flags remain false; Android behavior unchanged; unknown platforms fail closed.
- [x] Run focused tests red, then implement separate view capabilities and footer actions.
- [x] Add tested read-only data parsing and loaders; preserve missing/failed data distinctly from zero and handle stale requests.
- [x] Implement iOS ambassador cabinet, received airdrop history, unlock timeline and protocol contract information with wallet context and retry/refresh.
- [x] Restore HOME/EARN animated navigation; restricted BUY/SWAP taps show localized status instead of asking for a signing wallet.
- [x] Keep execution confirmation routes redirected; restore search only for actual read-only pages.
- [x] Test parsers/capabilities, TypeScript, lint, iOS and Android export. Verify on iPhone/iPad without spending funds.
- [ ] Update version/review notes/age metadata/screenshots accurately; build and upload 1.0.6 with the next remote build number.
- [ ] In Chrome attach exact new build, review changes, submit, and verify Waiting for Review.
- [ ] Commit the scoped, reproducible release changes and push to the existing remote branch as previously requested. Do not stage unrelated API/ops work.

## Added September 19: missing USDT on an unactivated address

- [x] Trace supplied transaction to the recipient and compare indexer responses with on-chain balanceOf.
- [x] Reproduce false-zero behavior with failing tests; implement bounded read-only core-token balance queries and prevent failed token loads being cached as zero.
- [x] Verify 100 USDT in the actual iOS wallet UI without activating or transferring funds.
- [x] Confirm the same loader is present in the published Android release base.
- [x] Correct independent review finding: partial UNLOCK failures must not hide healthy data.
- [ ] Build iOS 16 / Android 17, upload and submit through store consoles. Android release is now explicitly authorized by the user because the shared defect was confirmed.
