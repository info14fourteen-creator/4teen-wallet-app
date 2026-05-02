# 4TEEN Store Field Pack

Last updated: 2026-05-02

This is the practical submission pack: exact values where we already know them, plus careful recommendations where the console asks policy-style questions.

## Shared identity

- App name: `4TEEN`
- Internal label: `4TEEN Wallet`
- Positioning line: `Wallet & protocol access`
- Version: `1.0.1`
- Bundle identifier: `me.fourteen.wallet`
- Android package: `me.fourteen.wallet`
- Website: `https://4teen.me`
- Privacy policy: `https://4teen.me/privacy`
- Terms: `https://4teen.me/terms`
- Support URL: `https://4teen.me/support`
- Support email: `support@4teen.me`

## Apple App Store Connect

### App Information

- Name: `4TEEN`
- Subtitle: `Wallet & protocol access`
- Primary category: `Finance`
- Secondary category:
  - leave empty at first, or
  - use `Utilities` only if review pushes back on `Finance`

### App Privacy / Contact

- Support URL: `https://4teen.me/support`
- Marketing URL: `https://4teen.me`
- Privacy Policy URL: `https://4teen.me/privacy`

### Promotional text

`Buy, swap, manage wallets, and access 4TEEN protocol flows from one mobile app.`

### Keywords

`4TEEN,wallet,TRON,swap,airdrop,buy,web3,token,crypto`

### Description

Use the long App Store description from:

- `release/STORE_METADATA.md`

### Review notes

Use the prepared baseline from:

- `release/APP_REVIEW_NOTES.md`

Short reviewer version:

`4TEEN is a non-custodial wallet and protocol access app for the 4TEEN ecosystem on TRON. Reviewers do not need a separate account login. App access starts from local wallet creation or wallet import. The app supports watch-only and signing wallets, wallet send/receive, swaps, direct-buy routes, protocol information surfaces, and an in-app browser/WebView route. Sensitive actions can be protected by passcode and biometrics. Support: https://4teen.me/support`

### Age rating guidance

This app includes an in-app browser / web content route.

Because of that, be careful in the age-rating questionnaire:

- if Apple treats the app as offering general web access, the rating can land higher than a simple wallet app
- answer the questionnaire truthfully based on the current in-app browser behavior

Practical recommendation:

- do not force a low age rating blindly
- treat the browser/WebView route as the main factor that can raise the rating

### Encryption

- `ITSAppUsesNonExemptEncryption = false` is already declared in app config

### Login requirement

- No separate account signup/login is required to enter the app

## Google Play Console

### App details

- App name: `4TEEN`
- Default language: English
- App category: `Finance`
- Short description:
  `Wallet and protocol access for the 4TEEN ecosystem on TRON.`
- Full description:
  use the Play full description from `release/STORE_METADATA.md`

### Contact details

- Website: `https://4teen.me`
- Support email: `support@4teen.me`
- Privacy policy: `https://4teen.me/privacy`

### App access

- No username/password account is required
- Core access begins from local wallet creation or wallet import

### Content rating guidance

Because the app includes wallet actions plus an in-app browser/WebView route, complete the questionnaire carefully and truthfully.

Do not assume the lowest rating automatically.

### Data safety guidance

This should be answered only from the actual shipped app behavior and SDK inventory.

Current code review suggests:

- no obvious third-party analytics SDK
- no obvious crash-reporting SDK
- camera access is used for QR flows
- local wallet/security/settings data exists on device
- public blockchain reads and backend/API requests occur for app functionality

But the Play Console declaration should still be completed conservatively from the final shipped behavior, not from assumptions.

### Ads

- No ad SDK is visible in the current mobile app package
- Answer as `No ads` unless that changes before release

## Screenshot order

Use:

- `release/SCREENSHOT_PLAN.md`
- `release/SCREENSHOT_CAPTIONS.md`

Recommended first upload order:

### Apple

1. Wallet home
2. Send
3. Swap
4. Direct Buy
5. Airdrop
6. Ambassador

### Google Play

1. Wallet home
2. Send
3. Swap
4. Direct Buy

## Current external blocker

iOS distribution still requires a paid Apple Developer Program team on the Apple account.

Android build progress is tracked separately in:

- `release/RELEASE_READINESS_STATUS.md`
- `release/STORE_RELEASE_CHECKLIST.md`
