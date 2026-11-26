# Unified transaction fee candidate

Source: `codex/ios-account-deletion`, based on `727e17c` and the existing
1.0.11 working-tree changes. Do not build the older `codex/transfer-pass-mvp`
checkout for this candidate. Existing unrelated changes are preserved.

## Existing confirmations

- Token transfer (ordinary TRX transfer excluded).
- Direct token purchase.
- Swap, including allowance approval under one total budget.
- Liquidity bootstrap/execute.
- Ambassador registration.
- Ambassador reward withdrawal.

Each existing commission field displays the selected all-in fee and the total
approved maximum in parentheses. No new route or confirmation screen is added.
Provider pricing and service margin remain inside the rental quote; payment
network cost is included. Separate rental cards and duplicate fee-cap rows are
removed. Existing platform navigation restrictions are preserved.

## Safety behavior

- Estimate the burn ceiling independently of rental pricing, with the existing
  15% estimate safety margin and a per-stage Bandwidth reserve.
- Rental is selected only when cheaper and compatible with the total ceiling.
  TRON fee_limit constrains delegated Energy too; therefore some otherwise
  cheaper quotes are deliberately rejected before payment.
- Persist the intent, reserved rental cost, and signed transaction before
  broadcast. Retries reconcile or rebroadcast the same signed transaction.
- Confirmed stage receipts survive partial journal cleanup. Completed approval
  identifiers retain their result so a late retry does not create another send.
- Unknown paid-rental outcomes stop for reconciliation, never blind paid
  rental plus burn. Failed transactions are not silently retried with a new hash.
- Contract call value and available TRX are checked before rental payment.
- Storage uses the existing account-deletion write barrier. No private keys are
  added to the operation journal.

These are device-local protections, not cross-device/server idempotency.
They do not survive explicit deletion of the wallet's local data. Automatic
refunds and guaranteed execution after an ambiguous paid order are not claimed.

## Verification and release boundary

- Offline tests cover restart, uncertain delivery, uncertain receipt, failed
  storage, partial cleanup, completed-operation retry, shared swap budget,
  balance checks, fee math, and wiring of all six existing confirmations.
- TypeScript and scoped ESLint checks pass.
- iOS JavaScript/Hermes export is checked; this is not an App Store archive or
  a visual device test.
- No real transfer, provider purchase, or background-funding activation is
  performed for this candidate. Production recovery controls are not changed.
- On 27 November, installed the current-source Release build as 1.0.11 (32)
  over the restored 1.0.11 (30), without uninstalling. Bundle identifier and
  signing team remain `me.fourteen.wallet` and `6F69J57R99`.
- Device app inventory confirms version 1.0.11 (32), and launch succeeded.
  Before/after comparison matched all 43 local storage entries, including the
  same three wallets and active-wallet selection. Keychain secrets were not
  read or exported. This is not a test of signing access.
- Current iOS source tests: 226 passed. Both source commits were pushed to
  `origin/codex/ios-account-deletion` (`9dc1743`, `0b970d4`). Unrelated older
  storefront metadata and screenshots were not included.
- After the user unlocked the wallet, visual inspection confirmed the current
  wallet interface and opened the Send form. iPhone Mirroring then disconnected
  due to direct phone use and required Mac authentication on reconnect.
  The fee confirmation rows have NOT yet been visually verified. A read-only
  buy-review deep link was opened; no payment authorization or transfer occurred.
- Before financial activation: provider Energy and Bandwidth delivery, actual
  on-chain costs, failure recovery, and the final confirmation layout require
  the separately authorized end-to-end/device acceptance test.
