# 4teen-wallet-app — RECENT CHANGES

Generated: 2026-05-02T00:50:14.701Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: a7ee6bb468bf1e973c4b31b3bae0db9287621b9a
Short commit: a7ee6bb
Commit subject: Prepare release flows, ops bot, and store update checks
Commit author: info14fourteen-creator
Commit date: 2026-05-02T05:49:56+05:00

## Files changed in last commit

- M	.gitignore
- M	apps/api/clock.js
- M	apps/api/package.json
- A	apps/api/scripts/export-knowledge-base.js
- A	apps/api/scripts/export-product-notes.js
- A	apps/api/scripts/export-repo-map.js
- A	apps/api/scripts/sync-knowledge-base.js
- M	apps/api/src/app.js
- M	apps/api/src/config/env.js
- A	apps/api/src/routes/appVersion.js
- M	apps/api/src/routes/ops.js
- M	apps/api/src/services/gasstation/gasStation.js
- A	apps/api/src/services/liquidity/execution.js
- A	apps/api/src/services/ops/codexJobs.js
- M	apps/api/src/services/ops/events.js
- A	apps/api/src/services/ops/knowledgeBase.js
- A	apps/api/src/services/ops/openai.js
- A	apps/api/src/services/ops/productNotes.js
- M	apps/api/src/services/ops/store.js
- A	apps/api/src/services/ops/tasks.js
- M	apps/api/src/services/ops/telegramAdminBot.js
- A	apps/mobile/.easignore
- M	apps/mobile/app.json
- M	apps/mobile/app/about.tsx
- D	apps/mobile/app/ui-shell-lab.tsx.bak
- M	apps/mobile/assets/images/icon.png
- A	apps/mobile/eas.json
- M	apps/mobile/metro.config.js
- M	apps/mobile/modules/install-referrer/android/src/main/java/expo/modules/installreferrer/InstallReferrerModule.kt
- M	apps/mobile/modules/install-referrer/src/InstallReferrerModule.ts
- M	apps/mobile/package.json
- D	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-facebook-youtube-cards.png
- D	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-info-expanded.png
- D	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-overview-telegram-available.png
- D	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-social-rollout-cards.png
- D	apps/mobile/screenshots/airdrop-site-2026-05-01/telegram-web-login-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/about-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/address-book-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/airdrop-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/ambassador-program-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/appearance-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/authentication-method-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/buy-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/create-wallet-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/currency-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/import-private-key-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/import-seed-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/import-wallet-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/import-watch-only-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/language-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/liquidity-controller-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/search-quick-pages.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/send-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/settings-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/swap-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/terms-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/unlock-timeline-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-asset-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-main.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-management-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-setup-screen.png
- D	apps/mobile/screenshots/ui-audit-2026-05-01/whitepaper-screen.png
- M	apps/mobile/scripts/update-version.mjs
- M	apps/mobile/src/config/app-version.ts
- A	apps/mobile/src/services/app-release.ts
- A	apps/mobile/src/shims/noble-hashes-crypto.js
- D	apps/mobile/src/ui/footer-nav.tsx.bak
- M	apps/mobile/src/ui/top-chrome.tsx
- D	backups/2026-04-17_182854/apps/mobile/app/_layout.tsx
- D	backups/2026-04-17_182854/apps/mobile/app/ui-shell-lab.tsx
- D	backups/2026-04-17_182854/apps/mobile/src/ui/footer-nav.tsx
- D	backups/2026-04-17_183730/apps/mobile/src/ui/footer-nav.tsx
- D	backups/2026-04-17_183935/apps/mobile/src/ui/footer-nav.tsx
- D	backups/2026-04-17_203953/apps/mobile/app/home.tsx.bak
- D	backups/2026-04-17_203953/apps/mobile/src/ui/footer-nav.tsx.bak
- D	backups/2026-04-17_204122/apps/mobile/app/home.tsx.bak
- D	backups/2026-04-17_204122/apps/mobile/src/ui/footer-nav.tsx.bak
- D	backups/manual/_layout.tsx.20260416-064459.bak
- D	backups/manual/home.tsx.20260416-064459.bak
- D	backups/manual/import.ts.20260416-064459.bak
- D	backups/manual/local-auth.ts.20260416-064459.bak
- D	backups/manual/send.tsx.20260416-064459.bak
- D	backups/manual/storage.ts.20260416-064459.bak
- D	backups/manual/token-details.tsx.20260416-064459.bak
- D	backups/manual/wallet-session.tsx.20260416-064459.bak
- D	backups/search-header-20260415-210130/about.tsx
- D	backups/search-header-20260415-210130/add-custom-token.tsx
- D	backups/search-header-20260415-210130/address-book.tsx
- D	backups/search-header-20260415-210130/backup-private-key.tsx
- D	backups/search-header-20260415-210130/confirm-passcode.tsx
- D	backups/search-header-20260415-210130/connections.tsx
- D	backups/search-header-20260415-210130/create-passcode.tsx
- D	backups/search-header-20260415-210130/create-wallet.tsx
- D	backups/search-header-20260415-210130/enable-biometrics.tsx
- D	backups/search-header-20260415-210130/export-mnemonic.tsx
- D	backups/search-header-20260415-210130/import-private-key.tsx
- D	backups/search-header-20260415-210130/import-seed.tsx
- D	backups/search-header-20260415-210130/import-wallet.tsx
- D	backups/search-header-20260415-210130/import-watch-only.tsx
- D	backups/search-header-20260415-210130/manage-crypto.tsx
- D	backups/search-header-20260415-210130/multisig-transactions.tsx
- D	backups/search-header-20260415-210130/settings.tsx
- D	backups/search-header-20260415-210130/terms.tsx
- D	backups/search-header-20260415-210130/token-details.tsx
- D	backups/search-header-20260415-210130/ui-lab.tsx
- D	backups/search-header-20260415-210130/whitepaper.tsx
- D	backups/search-overlay-20260415-213235/_layout.tsx.bak
- D	backups/search-overlay-20260415-213235/address-book.tsx.bak
- D	backups/search-overlay-20260415-213235/app-header.tsx.bak
- D	backups/search-overlay-20260415-213235/send.tsx.bak
- A	docs/ops/access-map.json
- A	docs/ops/access-map.md
- A	docs/ops/knowledge-base.md
- A	docs/ops/next-release-notes.md
- A	docs/ops/repo-map.md
- M	pnpm-lock.yaml
- A	release/APP_REVIEW_NOTES.md
- A	release/IOS_MEMBERSHIP_NEXT_STEPS.md
- A	release/RELEASE_READINESS_STATUS.md
- A	release/SCREENSHOT_CAPTIONS.md
- A	release/SCREENSHOT_PLAN.md
- A	release/STORE_FIELD_PACK.md
- A	release/STORE_METADATA.md
- A	release/STORE_RELEASE_CHECKLIST.md
- A	release/screenshots-ios-preview/01-wallet-home.png
- A	release/screenshots-ios-preview/02-send.png
- A	release/screenshots-ios-preview/03-swap.png
- A	release/screenshots-ios-preview/04-direct-buy.png
- A	release/screenshots-ios-preview/05-airdrop.png
- A	release/screenshots-ios-preview/06-ambassador.jpg

## Recent commits

- a7ee6bb | 2026-05-02 | Prepare release flows, ops bot, and store update checks
- d65a824 | 2026-05-01 | chore: update wallet AI bundle [skip ci]
- 1279df7 | 2026-05-02 | Polish app flows, dictionaries, and ops updates
- c007ba0 | 2026-05-02 | Add synthetic app flow screeners to ops bot
- 300828e | 2026-05-02 | Refresh admin bot webhook callback updates
- cc9fece | 2026-05-02 | Improve admin bot UX and Russian menu
- 58eb420 | 2026-05-02 | Hide ops webhook secret from public health
- faef40f | 2026-05-02 | Restore app version file after server-only commit
- 771caf6 | 2026-05-02 | Add ops admin Telegram bot and event monitoring
- 5df6682 | 2026-04-28 | chore: update wallet AI bundle [skip ci]
