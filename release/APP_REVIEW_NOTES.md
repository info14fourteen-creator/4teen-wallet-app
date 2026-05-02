# 4TEEN App Review Notes

Last updated: 2026-05-02

## Submission intent

These notes are meant for App Store Connect and Google Play reviewer context so the first review pass has less ambiguity.

## Product summary

4TEEN is a mobile wallet and protocol access app for the 4TEEN ecosystem on TRON.

The app lets users:

- create or import wallets
- keep full-access and watch-only wallets
- send and receive supported assets
- swap supported assets
- access 4TEEN-specific routes such as direct buy, airdrop, unlock timeline, liquidity visibility, and ambassador flows

## Reviewer guidance

- No separate username/password account is required to open the app.
- Core app access starts from local wallet creation or wallet import.
- Sensitive actions are protected by local passcode and biometric flows when enabled.
- The app includes read-heavy protocol information routes in addition to wallet actions.
- The app uses the device camera for QR scanning flows.
- The app does not require microphone access.

## Useful routes for quick review

Suggested reviewer path:

1. Open app
2. Create wallet or import a watch-only wallet
3. Open wallet home
4. Open send flow
5. Open swap flow
6. Open direct buy
7. Open airdrop
8. Open ambassador
9. Open terms/privacy/support links if needed

## External URLs

- Website: `https://4teen.me`
- Privacy: `https://4teen.me/privacy`
- Terms: `https://4teen.me/terms`
- Support: `https://4teen.me/support`

## Notes for Apple review

- Suggested category: `Finance`
- Fallback category if needed: `Utilities`
- `ITSAppUsesNonExemptEncryption` is declared as `false`
- The app is portrait-only

## Notes for Google Play review

- Suggested category: `Finance`
- Internal production artifact should be an Android App Bundle (`.aab`)

