# 4teen-wallet-app — PROJECT OVERVIEW

Generated: 2026-04-16T15:04:50.584Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 3823474f68ab78542931426d74fbd2b129adddd6
Short commit: 3823474
Commit subject: feat: refine send select token wallet picker ui
Commit author: info14fourteen-creator
Commit date: 2026-04-16T20:04:36+05:00

## Curated project tree

```txt
- .github/
  - workflows/
    - build-wallet-ai-bundle.yml
    - ci.yml
- apps/
  - mobile/
    - app/
      - (tabs)/
        - _layout.tsx
        - explore.tsx
        - index.tsx
      - _layout.tsx
      - about.tsx
      - add-custom-token.tsx
      - address-book.tsx
      - airdrop.tsx
      - ambassador-program.tsx
      - appearance.tsx
      - authentication-method.tsx
      - backup-private-key.tsx
      - browser.tsx
      - buy-4teen.tsx
      - confirm-passcode.tsx
      - connections.tsx
      - create-passcode.tsx
      - create-wallet.tsx
      - currency.tsx
      - enable-biometrics.tsx
      - export-mnemonic.tsx
      - font-lab.tsx
      - home.tsx
      - import-private-key.tsx
      - import-seed.tsx
      - import-wallet.tsx
      - import-watch-only.tsx
      - index.tsx
      - language.tsx
      - liquidity-controller.tsx
      - manage-crypto.tsx
      - modal.tsx
      - multisig-transactions.tsx
      - scan.tsx
      - select-wallet.tsx
      - send-select-token.tsx
      - send.tsx
      - settings.tsx
      - swap.tsx
      - terms.tsx
      - token-details.tsx
      - ui-lab.tsx
      - unlock-timeline.tsx
      - unlock.tsx
      - wallets.tsx
      - whitepaper.tsx
    - assets/
      - icons/
        - footer/
          - airdrop_footer.svg
          - ambassador_footer.svg
          - buy_footer.svg
          - swap_footer.svg
        - ui/
          - socials/
            - discord_social.svg
            - facebook_social.svg
            - github_social.svg
            - instagram_social.svg
            - telegram_social.svg
            - threads_social.svg
            - tiktok_social.svg
            - whatsapp_social.svg
            - x_social.svg
            - youtube_social.svg
          - add_contact_btn.svg
          - add_wallet_btn.svg
          - address_btn.svg
          - airdrop_qp_btn.svg
          - ambassador_qp_btn.svg
          - assets_btn.svg
          - az_sort_btn.svg
          - backspace_btn.svg
          - biologin_btn.svg
          - browser_back_btn.svg
          - browser_close_btn.svg
          - browser_copy_link_btn.svg
          - browser_forward_btn.svg
          - browser_more_btn.svg
          - browser_refresh_btn.svg
          - browser_share_btn.svg
          - buy_4teen_qp_btn.svg
          - close.svg
          - confirm_btn.svg
          - copy_btn.svg
          - create_add_wallet_qp_btn.svg
          - decline_btn.svg
          - footer_menu.svg
          - full_access_btn.svg
          - history_btn.svg
          - info_btn.svg
          - liquidity_qp_btn.svg
          - logo_white.svg
          - manage_full_btn.svg
          - manage_new_btn.svg
          - menu.svg
          - more_btn.svg
          - open_down_btn.svg
          - open_right_btn.svg
          - paste_btn.svg
          - preferences_btn.svg
          - qr_btn.svg
          - receive_btn.svg
          - remove_contact_btn.svg
          - scan.svg
          - search.svg
          - select_wallet_qp_btn.svg
          - send_btn.svg
          - send_qp_btn.svg
          - setings_btn.svg
          - share_btn.svg
          - swap_qp_btn.svg
          - toggle_off_btn.svg
          - toggle_on_btn.svg
          - unlock_qp_btn.svg
          - value_sort_btn.svg
          - wallet_btn.svg
          - watch_only_btn.svg
    - components/
      - ui/
        - collapsible.tsx
        - icon-symbol.ios.tsx
        - icon-symbol.tsx
      - external-link.tsx
      - haptic-tab.tsx
      - hello-wave.tsx
      - parallax-scroll-view.tsx
      - themed-text.tsx
      - themed-view.tsx
    - constants/
      - theme.ts
    - hooks/
      - use-color-scheme.ts
      - use-color-scheme.web.ts
      - use-theme-color.ts
    - scripts/
      - create-stub-screen.mjs
      - reset-project.js
      - update-version.mjs
    - src/
      - config/
        - app-version.ts
        - tron.ts
      - notice/
        - notice-provider.tsx
      - search/
        - search-provider.tsx
        - search-routes.ts
        - search-sheet.tsx
        - search-types.ts
      - security/
        - local-auth.ts
      - services/
        - tron/
          - api.ts
          - fourteen-price.ts
          - index.ts
        - wallet/
          - import.ts
          - index.ts
          - portfolio.ts
          - send.ts
          - storage.ts
        - address-book.ts
      - theme/
        - tokens.ts
        - ui.ts
      - ui/
        - address-qr-modal.tsx
        - app-header.constants.ts
        - app-header.tsx
        - expand-chevron.tsx
        - footer-nav.tsx
        - foundation.tsx
        - KeyboardView.tsx
        - menu-sheet.tsx
        - numeric-keypad.tsx
        - stub-screen.tsx
        - submenu-header.tsx
        - top-chrome.tsx
        - use-bottom-inset.ts
      - utils/
        - open-in-app-browser.ts
      - wallet/
        - wallet-session.tsx
    - app.json
    - eslint.config.js
    - metro.config.js
    - package.json
    - README.md
    - svg.d.ts
    - tsconfig.json
- backups/
  - search-header-20260415-210130/
    - about.tsx
    - add-custom-token.tsx
    - address-book.tsx
    - backup-private-key.tsx
    - confirm-passcode.tsx
    - connections.tsx
    - create-passcode.tsx
    - create-wallet.tsx
    - enable-biometrics.tsx
    - export-mnemonic.tsx
    - import-private-key.tsx
    - import-seed.tsx
    - import-wallet.tsx
    - import-watch-only.tsx
    - manage-crypto.tsx
    - multisig-transactions.tsx
    - settings.tsx
    - terms.tsx
    - token-details.tsx
    - ui-lab.tsx
    - whitepaper.tsx
- docs/
  - ai-snapshots/
    - 2026-04-09-wallet-home-wired.md
    - 2026-04-09-wallet-import-state.md
- scripts/
  - build-wallet-ai-bundles.mjs
- package.json
- pnpm-workspace.yaml
- turbo.json
```

## Included files

- docs/ai-snapshots/2026-04-09-wallet-home-wired.md
- docs/ai-snapshots/2026-04-09-wallet-import-state.md
- package.json

---

## FILE PATH

`docs/ai-snapshots/2026-04-09-wallet-home-wired.md`

## FILE CONTENT

```md
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
```

---

## FILE PATH

`docs/ai-snapshots/2026-04-09-wallet-import-state.md`

## FILE CONTENT

```md
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
```

---

## FILE PATH

`package.json`

## FILE CONTENT

```json
{
  "name": "4teen-wallet-app",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.4",
    "typescript": "^5.8.3"
  }
}
```
