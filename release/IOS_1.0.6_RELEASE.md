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
- Android release base `70d290a` and iOS base `f36204a` have the identical `api.ts` SHA-1 `541b4de017f0cd21b08afb599988d137d419065d`; the same unactivated-account defect exists on both. Android runtime UI validation remains pending; do not claim it passed.

## Build and submission

- Previous production build 15: `cce978f8-93af-44c8-b052-0963a5549daf`, fingerprint `443ae82dff6ccb23e21db227c544c36953415d59`. Build and upload completed, but NOT sent to review; superseded because of the USDT defect.
- Replacement iOS build 16 and Android versionCode 17 requested with EAS production profile. Record final IDs/status after upload completes.
- Builds begin from the complete dirty mobile tree over `f36204a240a1f7d7b4d854758a5b9631e066535d`. The release commit must capture that source; EAS's base Git SHA alone is not the full archive identity.
- App Store Connect 1.0.6 draft created in Chrome. New review notes and What's New saved.
- Upload of replacement build 16 to Apple: pending build completion.
- Submission to App Review: **not yet submitted**. Must attach exact build 16 and verify Waiting for Review in Chrome.
- Release policy: automatic after Apple approval; keep existing rating.
- Release commit/push: pending.

Metadata source: `apps/mobile/store.config.json`. Prior approved release: 1.0.5 (14).

## Token balance root cause

TRC20 funds are recorded in the token contract, not necessarily in an activated TRON account. Both account indexers returned successful empty data while `USDT.balanceOf(recipient)` returned 100000000 base units (100 USDT). The old loader only combined indexer lists and the UI filled a missing default token with zero. Core balances now use read-only `triggerconstantcontract` calls with validated 32-byte uint256 responses and a 15-second timeout. No signing/broadcast endpoint is used. Caches were versioned to avoid carrying the old false-zero snapshot into the update.

Reference: https://developers.tron.network/docs/trc20-contract-interaction
