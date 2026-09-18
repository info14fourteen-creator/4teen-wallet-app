# 4TEEN App Review Notes

Last updated: 2026-09-19 — iOS 1.0.6 (16). Exact Apple submission text is maintained in `apps/mobile/store.config.json`.

## Submission intent

These notes are meant for App Store Connect and Google Play reviewer context so the first review pass has less ambiguity.

## Product summary

4TEEN is a self-custody TRON wallet. iOS 1.0.6 adds read-only protocol records to the approved wallet functionality and fixes USDT/4TEEN balance discovery before TRON account activation. Balance reads are view-only contract queries, not token purchases or transfers.

The app lets users:

- create or import wallets
- keep full-access and watch-only wallets
- send and receive supported assets
- view balances, token details, and wallet activity
- manage visible and custom tokens
- save addresses, scan QR codes, and open user-entered URLs in a generic browser

The Android build retains the existing 4TEEN ecosystem and SUN.io-powered routes. Those routes are not available in the iOS build.

## Reviewer guidance

- No separate username/password account is required to open the app.
- Core app access starts from local wallet creation or wallet import.
- Sensitive actions are protected by local passcode and biometric flows when enabled.
- The app uses the device camera for QR scanning flows.
- The app does not require microphone access.

## Useful routes for quick review

Suggested iOS reviewer path:

1. Open app
2. Create wallet or import a watch-only wallet
3. Open wallet home
4. Open send flow
5. Open receive / QR code
6. Open wallet manager and add the public watch-only address below
7. Open token details and transaction history
8. Open the generic browser
9. Open settings, terms, privacy, or support if needed

## External URLs

- Website: `https://4teen.me`
- Privacy: `https://4teen.me/privacy`
- Terms: `https://4teen.me/terms`
- Support: `https://4teen.me/support`

## Legal / support identity

- Legal operator: `AG PLUS, MCHJ`
- D-U-N-S Number: `933906683`
- Store support email: `genesis@4teen.me`
- Legal/support location: `Tashkent, Uzbekistan`

## Notes for Apple review

- Suggested category: `Finance`
- Fallback category if needed: `Utilities`
- `ITSAppUsesNonExemptEncryption` is declared as `false`
- This iOS build does not provide cryptocurrency exchange services.
- Native Swap, Direct Buy, token purchase or token issuance, liquidity execution, ambassador registration/withdrawal/replay/referral promotion, and airdrop participation remain unavailable on iOS.
- HOME/EARN navigation is restored. Buy/Swap icons show an explicit unavailability notice and cannot open an execution route.
- Unlock history, contract information/balance, existing ambassador records, and received distributions are read-only and available to watch-only wallets.
- The generic in-app browser does not inject a TRON wallet provider, expose private keys, or sign blockchain transactions for websites.
- Direct navigation to execution confirmation routes safely returns to Wallet.
- No post-review feature switch or dApp signing shortcut is present.
- Unrestricted Web Access remains declared in the age rating, as required for the browser.
- AG PLUS, MCHJ does not operate an exchange, submit exchange orders, or take custody of user assets in this iOS build.
- The app supports portrait and landscape orientation.

### Review setup

- Public watch-only address: `TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT`
- No preset app passcode. A fresh install lets reviewers choose a local passcode if prompted; watch-only import needs no signing secret.
- Watch-only mode exposes no private key and cannot sign or submit transactions.

## Notes for Google Play review

- Suggested category: `Finance`
- Internal production artifact should be an Android App Bundle (`.aab`)
- Android retains the existing native SUN.io swap module. 4TEEN is not a custodial exchange; users review and sign supported on-chain transactions with their own wallet.
- Reviewers should not expect profit, return, reward, or price guarantees; the app presents current on-chain/protocol state and transaction routes only.
