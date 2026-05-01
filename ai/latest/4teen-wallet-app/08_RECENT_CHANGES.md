# 4teen-wallet-app — RECENT CHANGES

Generated: 2026-05-01T19:34:07.018Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 1279df7db56fc6de3de999bac9d898edd66fb2d1
Short commit: 1279df7
Commit subject: Polish app flows, dictionaries, and ops updates
Commit author: info14fourteen-creator
Commit date: 2026-05-02T00:33:46+05:00

## Files changed in last commit

- M	apps/api/src/routes/ops.js
- M	apps/api/src/services/ops/events.js
- M	apps/api/src/services/ops/telegramAdminBot.js
- M	apps/mobile/app/(tabs)/_layout.tsx
- M	apps/mobile/app/(tabs)/explore.tsx
- M	apps/mobile/app/(tabs)/index.tsx
- M	apps/mobile/app/_layout.tsx
- M	apps/mobile/app/about.tsx
- M	apps/mobile/app/add-custom-token.tsx
- M	apps/mobile/app/address-book.tsx
- M	apps/mobile/app/airdrop.tsx
- M	apps/mobile/app/ambassador-confirm.tsx
- M	apps/mobile/app/ambassador-program.tsx
- M	apps/mobile/app/ambassador-withdraw-confirm.tsx
- M	apps/mobile/app/authentication-method.tsx
- M	apps/mobile/app/backup-private-key.tsx
- M	apps/mobile/app/browser.tsx
- M	apps/mobile/app/buy-confirm.tsx
- M	apps/mobile/app/buy.tsx
- M	apps/mobile/app/confirm-passcode.tsx
- M	apps/mobile/app/connections.tsx
- M	apps/mobile/app/create-passcode.tsx
- M	apps/mobile/app/create-wallet.tsx
- M	apps/mobile/app/currency.tsx
- M	apps/mobile/app/earn.tsx
- M	apps/mobile/app/enable-biometrics.tsx
- M	apps/mobile/app/export-mnemonic.tsx
- A	apps/mobile/app/feedback.tsx
- M	apps/mobile/app/home.tsx
- M	apps/mobile/app/import-private-key.tsx
- M	apps/mobile/app/import-seed.tsx
- M	apps/mobile/app/import-wallet.tsx
- M	apps/mobile/app/import-watch-only.tsx
- M	apps/mobile/app/index.tsx
- M	apps/mobile/app/language.tsx
- M	apps/mobile/app/liquidity-confirm.tsx
- M	apps/mobile/app/liquidity-controller.tsx
- M	apps/mobile/app/manage-crypto.tsx
- M	apps/mobile/app/modal.tsx
- M	apps/mobile/app/scan.tsx
- M	apps/mobile/app/select-wallet.tsx
- M	apps/mobile/app/send-confirm.tsx
- M	apps/mobile/app/send.tsx
- M	apps/mobile/app/settings.tsx
- M	apps/mobile/app/swap-confirm.tsx
- M	apps/mobile/app/swap.tsx
- M	apps/mobile/app/terms.tsx
- M	apps/mobile/app/token-details.tsx
- M	apps/mobile/app/ui-lab.tsx
- M	apps/mobile/app/ui-shell-test-b.tsx
- M	apps/mobile/app/unlock-timeline.tsx
- M	apps/mobile/app/unlock.tsx
- M	apps/mobile/app/wallet.tsx
- M	apps/mobile/app/wallets.tsx
- M	apps/mobile/app/whitepaper.tsx
- A	apps/mobile/assets/icons/ui/stanat.png
- A	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-facebook-youtube-cards.png
- A	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-info-expanded.png
- A	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-overview-telegram-available.png
- A	apps/mobile/screenshots/airdrop-site-2026-05-01/airdrop-social-rollout-cards.png
- A	apps/mobile/screenshots/airdrop-site-2026-05-01/telegram-web-login-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/about-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/address-book-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/airdrop-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/ambassador-program-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/appearance-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/authentication-method-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/buy-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/create-wallet-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/currency-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/import-private-key-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/import-seed-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/import-wallet-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/import-watch-only-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/language-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/liquidity-controller-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/search-quick-pages.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/send-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/settings-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/swap-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/terms-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/unlock-timeline-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-asset-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-main.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-management-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/wallet-setup-screen.png
- A	apps/mobile/screenshots/ui-audit-2026-05-01/whitepaper-screen.png
- M	apps/mobile/src/config/app-version.ts
- A	apps/mobile/src/i18n/access-slices.ts
- M	apps/mobile/src/i18n/dictionaries.ts
- A	apps/mobile/src/i18n/emerging-slices.ts
- M	apps/mobile/src/i18n/index.tsx
- A	apps/mobile/src/i18n/navigation-slices.ts
- A	apps/mobile/src/i18n/protocol-runtime-slices.ts
- A	apps/mobile/src/i18n/protocol-slices.ts
- A	apps/mobile/src/i18n/remaining-slices.ts
- A	apps/mobile/src/i18n/settings-slices.ts
- A	apps/mobile/src/i18n/transaction-slices.ts
- M	apps/mobile/src/search/search-sheet.tsx
- M	apps/mobile/src/security/local-auth.ts
- M	apps/mobile/src/services/airdrop.ts
- M	apps/mobile/src/services/ambassador.ts
- M	apps/mobile/src/services/asset-wallets.ts
- M	apps/mobile/src/services/direct-buy.ts
- M	apps/mobile/src/services/energy-resale.ts
- A	apps/mobile/src/services/feedback.ts
- M	apps/mobile/src/services/liquidity-controller.ts
- M	apps/mobile/src/services/recent-recipients.ts
- M	apps/mobile/src/services/referral.ts
- M	apps/mobile/src/services/swap/sunio.ts
- M	apps/mobile/src/services/tron/api.ts
- M	apps/mobile/src/services/tron/fourteen-price.ts
- M	apps/mobile/src/services/unlock-timeline.ts
- M	apps/mobile/src/services/wallet/import.ts
- M	apps/mobile/src/services/wallet/portfolio.ts
- M	apps/mobile/src/services/wallet/resources.ts
- M	apps/mobile/src/services/wallet/send.ts
- M	apps/mobile/src/services/wallet/storage.ts
- M	apps/mobile/src/settings/display-currency.ts
- M	apps/mobile/src/theme/patterns.ts
- M	apps/mobile/src/theme/ui.ts
- M	apps/mobile/src/ui/currency-format.ts
- M	apps/mobile/src/ui/energy-resale-card.tsx
- M	apps/mobile/src/ui/footer-nav.tsx
- M	apps/mobile/src/ui/foundation.tsx
- M	apps/mobile/src/ui/fourteen-wallet-loader.tsx
- M	apps/mobile/src/ui/lottie-icon.tsx
- M	apps/mobile/src/ui/product-shell.tsx
- M	apps/mobile/src/ui/selected-wallet-switcher.tsx
- M	apps/mobile/src/ui/settings-row.tsx
- M	apps/mobile/src/ui/stub-screen.tsx
- M	apps/mobile/src/ui/top-chrome.tsx

## Recent commits

- 1279df7 | 2026-05-02 | Polish app flows, dictionaries, and ops updates
- c007ba0 | 2026-05-02 | Add synthetic app flow screeners to ops bot
- 300828e | 2026-05-02 | Refresh admin bot webhook callback updates
- cc9fece | 2026-05-02 | Improve admin bot UX and Russian menu
- 58eb420 | 2026-05-02 | Hide ops webhook secret from public health
- faef40f | 2026-05-02 | Restore app version file after server-only commit
- 771caf6 | 2026-05-02 | Add ops admin Telegram bot and event monitoring
- 5df6682 | 2026-04-28 | chore: update wallet AI bundle [skip ci]
- 92c5421 | 2026-04-28 | Add app language infrastructure and key mobile translations
- 95e63f7 | 2026-04-28 | chore: update wallet AI bundle [skip ci]
