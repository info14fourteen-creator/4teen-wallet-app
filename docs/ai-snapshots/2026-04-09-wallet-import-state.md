# 4TEEN Wallet App - AI Snapshot
Date: 2026-04-09

## Current focus
Implement real wallet import and local wallet persistence before wiring real wallet data into home.tsx.

## What was completed
- Added local wallet storage service:
  - `apps/mobile/src/services/wallet/storage.ts`
  - stores wallet metadata in AsyncStorage
  - stores mnemonic/private key secrets in SecureStore
  - supports:
    - `listWallets()`
    - `saveWallet()`
    - `getWalletById()`
    - `getWalletByAddress()`
    - `setActiveWalletId()`
    - `getActiveWalletId()`
    - `getActiveWallet()`
    - `getWalletSecret()`

- Added wallet import service:
  - `apps/mobile/src/services/wallet/import.ts`
  - supports:
    - `normalizeMnemonicInput()`
    - `getMnemonicSuggestions()`
    - `normalizePrivateKey()`
    - `isValidPrivateKey()`
    - `isValidTronAddress()`
    - `importWalletFromMnemonic()`
    - `importWalletFromPrivateKey()`
    - `importWalletFromWatchOnly()`
  - mnemonic import uses `TronWeb.fromMnemonic(...)`
  - private key import derives TRON address locally
  - watch-only import saves validated address without secrets

- Added wallet barrel export:
  - `apps/mobile/src/services/wallet/index.ts`

- Import flows updated:
  - `apps/mobile/app/import-wallet.tsx`
  - `apps/mobile/app/import-seed.tsx`
  - `apps/mobile/app/import-private-key.tsx`
  - `apps/mobile/app/import-watch-only.tsx`

- Passcode / biometrics flow improved:
  - `apps/mobile/app/create-passcode.tsx`
  - `apps/mobile/app/confirm-passcode.tsx`
  - `apps/mobile/app/enable-biometrics.tsx`
  - `apps/mobile/app/unlock.tsx`
  - passcode screens now use reusable numeric keypad
  - biometric enable screen uses `disableDeviceFallback: true`

- Added reusable numeric keypad:
  - `apps/mobile/src/ui/numeric-keypad.tsx`

- UI / navigation cleanup:
  - `apps/mobile/src/ui/app-header.tsx`
  - burger menu remains burger on pages where it should remain burger
  - back navigation handled by submenu header, not by hijacking burger icon
  - `apps/mobile/src/ui/submenu-header.tsx`
  - `apps/mobile/src/ui/foundation.tsx` fixed for current tokens/layout

- Wallet pages are no longer fake placeholders:
  - `apps/mobile/app/wallets.tsx`
  - `apps/mobile/app/select-wallet.tsx`
  - next step is to wire them to real stored wallets if not already finalized in current branch

## Current known architecture decisions
- TronScan and TronGrid requests must go through backend proxy in production.
- API keys must not live in the mobile client in production.
- For now local import/storage work is priority.
- `home.tsx` still needs final wiring to:
  - `getActiveWallet()`
  - `getWalletSnapshot(address)`
  so imported wallets actually render on the main screen.

## Important files
- `apps/mobile/src/services/wallet/storage.ts`
- `apps/mobile/src/services/wallet/import.ts`
- `apps/mobile/src/services/wallet/index.ts`
- `apps/mobile/app/import-seed.tsx`
- `apps/mobile/app/import-private-key.tsx`
- `apps/mobile/app/import-watch-only.tsx`
- `apps/mobile/app/home.tsx`
- `apps/mobile/app/wallets.tsx`
- `apps/mobile/app/select-wallet.tsx`
- `apps/mobile/src/services/tron/api.ts`
- `apps/mobile/src/services/tron/fourteen-price.ts`

## Next task
Wire `home.tsx` to active stored wallet and real chain snapshot:
1. load `getActiveWallet()`
2. if no active wallet -> show empty state
3. if active wallet exists -> call `getWalletSnapshot(activeWallet.address)`
4. show:
   - wallet name
   - full address with copy
   - TRX balance
   - TRC20 assets
5. later add 4TEEN pricing override via Sun.io quote code

## Notes
- Seed phrase screen:
  - supports paste of numbered mnemonic
  - distributes phrase into fields
  - suggestions are shown via notice layer
- Private key screen:
  - must really import and persist wallet, not just navigate
- Watch-only screen:
  - must really save wallet and set it active


## Snapshot commit
- b1af20e
