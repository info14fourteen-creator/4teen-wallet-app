# 4teen-wallet-app — RECENT CHANGES

Generated: 2026-04-15T23:08:13.725Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: f093b92ca9aa15c5b6b633b54d08c17f00a739fc
Short commit: f093b92
Commit subject: search: smart search UX, quick pages, icons, tags, layout sync with header
Commit author: info14fourteen-creator
Commit date: 2026-04-16T04:08:04+05:00

## Files changed in last commit

- M	apps/mobile/app/_layout.tsx
- M	apps/mobile/app/about.tsx
- M	apps/mobile/app/add-custom-token.tsx
- M	apps/mobile/app/address-book.tsx
- A	apps/mobile/app/airdrop.tsx
- A	apps/mobile/app/ambassador-program.tsx
- A	apps/mobile/app/appearance.tsx
- A	apps/mobile/app/authentication-method.tsx
- M	apps/mobile/app/backup-private-key.tsx
- A	apps/mobile/app/buy-4teen.tsx
- M	apps/mobile/app/confirm-passcode.tsx
- M	apps/mobile/app/connections.tsx
- M	apps/mobile/app/create-passcode.tsx
- M	apps/mobile/app/create-wallet.tsx
- A	apps/mobile/app/currency.tsx
- M	apps/mobile/app/enable-biometrics.tsx
- M	apps/mobile/app/export-mnemonic.tsx
- A	apps/mobile/app/export-mnemonic.tsx.bak_2026-04-16_004313
- M	apps/mobile/app/home.tsx
- M	apps/mobile/app/import-private-key.tsx
- M	apps/mobile/app/import-seed.tsx
- M	apps/mobile/app/import-wallet.tsx
- M	apps/mobile/app/import-watch-only.tsx
- A	apps/mobile/app/language.tsx
- A	apps/mobile/app/liquidity-controller.tsx
- M	apps/mobile/app/manage-crypto.tsx
- M	apps/mobile/app/multisig-transactions.tsx
- M	apps/mobile/app/select-wallet.tsx
- M	apps/mobile/app/send.tsx
- A	apps/mobile/app/send.tsx.bak_2026-04-16_004313
- M	apps/mobile/app/settings.tsx
- A	apps/mobile/app/settings.tsx.bak_2026-04-16_004912
- A	apps/mobile/app/settings.tsx.bak_2026-04-16_010846
- M	apps/mobile/app/terms.tsx
- M	apps/mobile/app/token-details.tsx
- M	apps/mobile/app/ui-lab.tsx
- A	apps/mobile/app/unlock-timeline.tsx
- M	apps/mobile/app/wallets.tsx
- M	apps/mobile/app/whitepaper.tsx
- A	apps/mobile/assets/icons/ui/airdrop_qp_btn.svg
- A	apps/mobile/assets/icons/ui/ambassador_qp_btn.svg
- A	apps/mobile/assets/icons/ui/buy_4teen_qp_btn.svg
- A	apps/mobile/assets/icons/ui/create_add_wallet_qp_btn.svg
- A	apps/mobile/assets/icons/ui/liquidity_qp_btn.svg
- A	apps/mobile/assets/icons/ui/select_wallet_qp_btn.svg
- A	apps/mobile/assets/icons/ui/send_qp_btn.svg
- A	apps/mobile/assets/icons/ui/swap_qp_btn.svg
- A	apps/mobile/assets/icons/ui/unlock_qp_btn.svg
- A	apps/mobile/scripts/create-stub-screen.mjs
- M	apps/mobile/src/config/app-version.ts
- A	apps/mobile/src/search/search-provider.tsx
- A	apps/mobile/src/search/search-routes.ts
- A	apps/mobile/src/search/search-routes.ts.bak_2026-04-16_010846
- A	apps/mobile/src/search/search-routes.ts.bak_2026-04-16_012717
- A	apps/mobile/src/search/search-routes.ts.bak_2026-04-16_030621
- A	apps/mobile/src/search/search-sheet.tsx
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-15_2208
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-15_224647
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_010846
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_012717
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_025412
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_030621
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_034405
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_035746
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_040231
- A	apps/mobile/src/search/search-sheet.tsx.bak_2026-04-16_040357
- A	apps/mobile/src/search/search-types.ts
- A	apps/mobile/src/search/search-types.ts.bak_2026-04-16_010846
- A	apps/mobile/src/search/search-types.ts.bak_2026-04-16_012717
- A	apps/mobile/src/search/search-types.ts.bak_2026-04-16_030621
- M	apps/mobile/src/ui/app-header.tsx
- A	apps/mobile/src/ui/stub-screen.tsx
- A	backups/manual/search-lab.tsx.20260415-211651.bak
- A	backups/search-header-20260415-210130/about.tsx
- A	backups/search-header-20260415-210130/add-custom-token.tsx
- A	backups/search-header-20260415-210130/address-book.tsx
- A	backups/search-header-20260415-210130/backup-private-key.tsx
- A	backups/search-header-20260415-210130/confirm-passcode.tsx
- A	backups/search-header-20260415-210130/connections.tsx
- A	backups/search-header-20260415-210130/create-passcode.tsx
- A	backups/search-header-20260415-210130/create-wallet.tsx
- A	backups/search-header-20260415-210130/enable-biometrics.tsx
- A	backups/search-header-20260415-210130/export-mnemonic.tsx
- A	backups/search-header-20260415-210130/import-private-key.tsx
- A	backups/search-header-20260415-210130/import-seed.tsx
- A	backups/search-header-20260415-210130/import-wallet.tsx
- A	backups/search-header-20260415-210130/import-watch-only.tsx
- A	backups/search-header-20260415-210130/manage-crypto.tsx
- A	backups/search-header-20260415-210130/multisig-transactions.tsx
- A	backups/search-header-20260415-210130/settings.tsx
- A	backups/search-header-20260415-210130/terms.tsx
- A	backups/search-header-20260415-210130/token-details.tsx
- A	backups/search-header-20260415-210130/ui-lab.tsx
- A	backups/search-header-20260415-210130/whitepaper.tsx
- A	backups/search-overlay-20260415-213235/_layout.tsx.bak
- A	backups/search-overlay-20260415-213235/address-book.tsx.bak
- A	backups/search-overlay-20260415-213235/app-header.tsx.bak
- A	backups/search-overlay-20260415-213235/send.tsx.bak

## Recent commits

- f093b92 | 2026-04-16 | search: smart search UX, quick pages, icons, tags, layout sync with header
- 8271551 | 2026-04-15 | chore: update wallet AI bundle [skip ci]
- fb32c15 | 2026-04-15 | chore: bump mobile app version
- 430ae63 | 2026-04-15 | feat: add wallet option placeholder screens and bump version
- 4db9561 | 2026-04-15 | feat: wire wallet management option routes
- a12072a | 2026-04-15 | chore: update wallet AI bundle [skip ci]
- 12e0370 | 2026-04-15 | feat: refine home actions and inline wallet options
- 675d6f2 | 2026-04-15 | chore: update wallet AI bundle [skip ci]
- 580329e | 2026-04-15 | Finalize home header alignment fixes
- 39861eb | 2026-04-15 | Align ui-lab eyebrow header spacing
