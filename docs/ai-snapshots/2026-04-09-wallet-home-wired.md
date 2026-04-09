# 4TEEN Wallet App - AI Snapshot
Date: 2026-04-09

## Current focus
Real wallet import, local wallet persistence, wallet selection, and home screen wallet rendering are now wired together.

## What is working now
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
  - mnemonic import derives wallet through TronWeb
  - private key import derives TRON address locally
  - watch-only import saves validated address without secret material

- `apps/mobile/src/services/wallet/index.ts`
  - exports wallet import and wallet storage services

## UI state
- `apps/mobile/app/import-wallet.tsx`
  - routes correctly into real import flows
  - signing imports remain behind passcode flow
  - watch-only remains lighter

- `apps/mobile/app/import-seed.tsx`
  - supports 12/24 word switch
  - supports full clipboard paste
  - supports numbered mnemonic cleanup
  - splits words into fields automatically
  - shows sticky suggestions via notice layer
  - imports wallet for real through `importWalletFromMnemonic(...)`

- `apps/mobile/app/import-private-key.tsx`
  - validates private key
  - imports wallet for real through `importWalletFromPrivateKey(...)`

- `apps/mobile/app/import-watch-only.tsx`
  - validates TRON address
  - saves wallet for real through `importWalletFromWatchOnly(...)`

- `apps/mobile/app/select-wallet.tsx`
  - loads real stored wallets
  - reads active wallet id
  - allows selecting active wallet
  - returns to `/home`

- `apps/mobile/app/wallets.tsx`
  - loads real stored wallets
  - shows active wallet state
  - routes user into wallet selection flow

- `apps/mobile/app/home.tsx`
  - loads active wallet from storage
  - if no wallet exists, shows empty state
  - if wallet exists, loads live chain snapshot with:
    - wallet name
    - wallet address
    - wallet kind
    - TRX balance
    - TRC20 assets
  - asset list renders token logos when available

## Important architecture notes
- Production TRON requests must go through backend proxy.
- API keys must not live inside the mobile client in production.
- Current client-side TRON service is acceptable only as temporary development wiring.
- Duplicate experimental wallet store file was removed:
  - `apps/mobile/src/services/wallet/store.ts`

## Next recommended task
Move TRON data fetching behind backend proxy and then:
1. replace direct TronGrid / TronScan client calls
2. keep `home.tsx` logic but point it at proxy-backed wallet snapshot service
3. later add 4TEEN price override from Sun.io quote flow

## Important files
- `apps/mobile/src/services/wallet/storage.ts`
- `apps/mobile/src/services/wallet/import.ts`
- `apps/mobile/src/services/wallet/index.ts`
- `apps/mobile/app/import-seed.tsx`
- `apps/mobile/app/import-private-key.tsx`
- `apps/mobile/app/import-watch-only.tsx`
- `apps/mobile/app/select-wallet.tsx`
- `apps/mobile/app/wallets.tsx`
- `apps/mobile/app/home.tsx`
- `apps/mobile/src/services/tron/api.ts`
- `apps/mobile/src/services/tron/fourteen-price.ts`
