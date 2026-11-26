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
- Phone installation remains separate; this candidate is not installed over
  the restored original 1.0.11 (30) binary.
- Before financial activation: provider Energy and Bandwidth delivery, actual
  on-chain costs, failure recovery, and the final confirmation layout require
  the separately authorized end-to-end/device acceptance test.
