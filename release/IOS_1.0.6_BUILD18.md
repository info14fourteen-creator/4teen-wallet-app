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
