# 4teen-wallet-app — RECENT CHANGES

Generated: 2026-04-27T12:16:26.163Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 35126bbf2bca745668084a89cd1c4a8c02d8e146
Short commit: 35126bb
Commit subject: Fully internalize ambassador backend flow
Commit author: info14fourteen-creator
Commit date: 2026-04-27T17:16:04+05:00

## Files changed in last commit

- M	apps/api/clock.js
- M	apps/api/src/config/env.js
- A	apps/api/src/db/queries/ambassadors.js
- A	apps/api/src/db/queries/buyerBindings.js
- A	apps/api/src/db/queries/buyers.js
- A	apps/api/src/db/queries/purchases.js
- M	apps/api/src/routes/ambassador.js
- M	apps/api/src/services/ambassador/controller.js
- A	apps/api/src/services/ambassador/reconcilePurchase.js
- A	apps/api/src/services/ambassador/replayPending.js
- A	apps/api/src/services/ambassador/replayQueue.js
- A	apps/api/src/services/ambassador/resourceGate.js
- A	apps/api/src/services/ambassador/sync.js
- A	apps/api/src/services/ambassador/token.js
- M	apps/mobile/app/about.tsx
- M	apps/mobile/app/add-custom-token.tsx
- M	apps/mobile/app/ambassador-program.tsx
- M	apps/mobile/app/authentication-method.tsx
- M	apps/mobile/app/backup-private-key.tsx
- M	apps/mobile/app/confirm-passcode.tsx
- M	apps/mobile/app/create-passcode.tsx
- M	apps/mobile/app/create-wallet.tsx
- M	apps/mobile/app/enable-biometrics.tsx
- M	apps/mobile/app/export-mnemonic.tsx
- M	apps/mobile/app/manage-crypto.tsx
- M	apps/mobile/app/select-wallet.tsx
- M	apps/mobile/app/send-confirm.tsx
- M	apps/mobile/app/send.tsx
- M	apps/mobile/app/settings.tsx
- M	apps/mobile/app/swap-confirm.tsx
- M	apps/mobile/app/swap.tsx
- M	apps/mobile/app/terms.tsx
- M	apps/mobile/app/token-details.tsx
- M	apps/mobile/app/unlock.tsx
- M	apps/mobile/app/wallet.tsx
- M	apps/mobile/app/wallets.tsx
- M	apps/mobile/app/whitepaper.tsx
- A	apps/mobile/assets/icons/footer/footer_airdrop.json
- A	apps/mobile/assets/icons/footer/footer_airdrop_idle.json
- A	apps/mobile/assets/icons/footer/footer_airdrop_idle_v4.json
- A	apps/mobile/assets/icons/footer/footer_airdrop_idle_v6.json
- A	apps/mobile/assets/icons/footer/footer_airdrop_press_v4.json
- A	apps/mobile/assets/icons/footer/footer_airdrop_press_v6.json
- A	apps/mobile/assets/icons/footer/footer_ambassador.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_idle.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_idle_v3.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_idle_v4.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_idle_v5.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_idle_v6.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_press_v4.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_press_v5.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_press_v6.json
- A	apps/mobile/assets/icons/footer/footer_ambassador_v2.json
- A	apps/mobile/assets/icons/footer/footer_buy.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle_v3.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle_v4.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle_v5.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle_v6.json
- A	apps/mobile/assets/icons/footer/footer_buy_idle_v7.json
- A	apps/mobile/assets/icons/footer/footer_buy_press_v4.json
- A	apps/mobile/assets/icons/footer/footer_buy_press_v5.json
- A	apps/mobile/assets/icons/footer/footer_buy_press_v6.json
- A	apps/mobile/assets/icons/footer/footer_buy_press_v7.json
- A	apps/mobile/assets/icons/footer/footer_buy_v2.json
- A	apps/mobile/assets/icons/footer/footer_earn.json
- A	apps/mobile/assets/icons/footer/footer_earn_green.json
- A	apps/mobile/assets/icons/footer/footer_earn_orange.json
- A	apps/mobile/assets/icons/footer/footer_home.json
- A	apps/mobile/assets/icons/footer/footer_info_static.json
- A	apps/mobile/assets/icons/footer/footer_liquidity_static.json
- A	apps/mobile/assets/icons/footer/footer_unlock_static.json
- M	apps/mobile/metro.config.js
- M	apps/mobile/src/config/app-version.ts
- M	apps/mobile/src/security/local-auth.ts
- M	apps/mobile/src/services/ambassador.ts
- M	apps/mobile/src/services/referral.ts
- M	apps/mobile/src/services/swap/sunio.ts
- M	apps/mobile/src/services/tron/api.ts
- M	apps/mobile/src/services/wallet/send.ts
- M	apps/mobile/src/ui/product-shell.tsx
- M	apps/mobile/src/ui/screen-loading-overlay.tsx
- M	apps/mobile/src/ui/screen-loading-state.tsx
- A	apps/mobile/src/ui/settings-row.tsx
- M	apps/mobile/src/ui/stub-screen.tsx
- M	apps/mobile/src/ui/ui-icons.tsx

## Recent commits

- 35126bb | 2026-04-27 | Fully internalize ambassador backend flow
- 58bf666 | 2026-04-26 | chore: update wallet AI bundle [skip ci]
- 73afe52 | 2026-04-27 | Refine mobile shell animations and search chrome
- 658fe50 | 2026-04-26 | chore: update wallet AI bundle [skip ci]
- a6da6d1 | 2026-04-26 | Unify mobile loading, spacing, and button patterns
- 3f0fd79 | 2026-04-25 | chore: update wallet AI bundle [skip ci]
- 897ec35 | 2026-04-25 | Tighten wallet flows, airdrop UX, and execution limits
- 4c9d0c2 | 2026-04-25 | chore: update wallet AI bundle [skip ci]
- 30741bd | 2026-04-25 | Add airdrop queue clock and funding flow
- acd9318 | 2026-04-25 | chore: update wallet AI bundle [skip ci]
