# 4TEEN Ops Knowledge Base

Generated at: 2026-05-01T23:02:13.282Z

## Ground rules
- Live ops data from Postgres and runtime checks is the source of truth for current health and incidents.
- This knowledge base is supporting context for repo structure, release planning, docs, screens, and recent product intent.
- Do not treat any secret value as available here. This export contains paths and summaries, not credentials.

## Repo Map
- Mobile screens indexed: 57
- API routes indexed: 35
- Ops services indexed: 8
- Markdown docs included: 7

### Mobile Screens
- /apps/mobile/app/_layout.tsx
- /apps/mobile/app/about.tsx
- /apps/mobile/app/add-custom-token.tsx
- /apps/mobile/app/address-book.tsx
- /apps/mobile/app/airdrop.tsx
- /apps/mobile/app/ambassador-confirm.tsx
- /apps/mobile/app/ambassador-program.tsx
- /apps/mobile/app/ambassador-withdraw-confirm.tsx
- /apps/mobile/app/appearance.tsx
- /apps/mobile/app/authentication-method.tsx
- /apps/mobile/app/backup-private-key.tsx
- /apps/mobile/app/browser.tsx
- /apps/mobile/app/buy-4teen.tsx
- /apps/mobile/app/buy-confirm.tsx
- /apps/mobile/app/buy.tsx
- /apps/mobile/app/confirm-passcode.tsx
- /apps/mobile/app/connections.tsx
- /apps/mobile/app/create-passcode.tsx
- /apps/mobile/app/create-wallet.tsx
- /apps/mobile/app/currency.tsx
- /apps/mobile/app/earn.tsx
- /apps/mobile/app/enable-biometrics.tsx
- /apps/mobile/app/export-mnemonic.tsx
- /apps/mobile/app/feedback.tsx
- /apps/mobile/app/font-lab.tsx
- /apps/mobile/app/home.tsx
- /apps/mobile/app/import-private-key.tsx
- /apps/mobile/app/import-seed.tsx
- /apps/mobile/app/import-wallet.tsx
- /apps/mobile/app/import-watch-only.tsx
- /apps/mobile/app/index.tsx
- /apps/mobile/app/language.tsx
- /apps/mobile/app/liquidity-confirm.tsx
- /apps/mobile/app/liquidity-controller.tsx
- /apps/mobile/app/manage-crypto.tsx
- /apps/mobile/app/modal.tsx
- /apps/mobile/app/multisig-transactions.tsx
- /apps/mobile/app/scan.tsx
- /apps/mobile/app/select-wallet.tsx
- /apps/mobile/app/send-confirm.tsx
- /apps/mobile/app/send.tsx
- /apps/mobile/app/settings.tsx
- /apps/mobile/app/swap-confirm.tsx
- /apps/mobile/app/swap.tsx
- /apps/mobile/app/terms.tsx
- /apps/mobile/app/token-details.tsx
- /apps/mobile/app/ui-lab.tsx
- /apps/mobile/app/ui-shell-lab.tsx
- /apps/mobile/app/ui-shell-test-a.tsx
- /apps/mobile/app/ui-shell-test-b.tsx
- /apps/mobile/app/unlock-timeline.tsx
- /apps/mobile/app/unlock.tsx
- /apps/mobile/app/wallet-access.tsx
- /apps/mobile/app/wallet-manager.tsx
- /apps/mobile/app/wallet.tsx
- /apps/mobile/app/wallets.tsx
- /apps/mobile/app/whitepaper.tsx

### API Routes
- /apps/api/src/routes/airdrop.js
  - GET /telegram/health
  - GET /telegram/overview
  - POST /telegram/guard-status
  - POST /telegram/session
  - POST /telegram/session/verify
  - POST /telegram/webhook/:secret
  - POST /telegram/link
  - POST /telegram/admin/process-queue
  - POST /telegram/admin/webhook/sync
  - POST /telegram/admin/import-legacy
- /apps/api/src/routes/ambassador.js
  - GET /slug/check
  - GET /by-wallet
  - POST /register-complete
  - POST /after-buy
  - GET /cabinet/:wallet
  - GET /allocation/health
  - POST /replay-pending
  - POST /admin/process-pending
  - POST /withdrawal/confirm
- /apps/api/src/routes/gasstation.js
  - POST /notify/tron
- /apps/api/src/routes/health.js
  - GET /health
- /apps/api/src/routes/ops.js
  - GET /health
  - POST /telegram/webhook/:secret
  - POST /feedback
  - POST /feedback/app
  - POST /monitor/run
  - POST /notes
  - GET /notes/export
  - GET /knowledge/export
  - POST /knowledge/sync
- /apps/api/src/routes/proxy.js
  - no inline router paths found
- /apps/api/src/routes/resources.js
  - POST /rental/quote
  - POST /rental/confirm
  - GET /rental/status
- /apps/api/src/routes/wallet.js
  - GET /trx-price
  - GET /snapshot

### Ops Services
- /apps/api/src/services/ops/events.js
- /apps/api/src/services/ops/knowledgeBase.js
- /apps/api/src/services/ops/monitor.js
- /apps/api/src/services/ops/openai.js
- /apps/api/src/services/ops/productNotes.js
- /apps/api/src/services/ops/screeners.js
- /apps/api/src/services/ops/store.js
- /apps/api/src/services/ops/telegramAdminBot.js

## Product Backlog
# Next Release Notes

> Generated from `ops_product_notes`.

No open notes right now.


## Source Doc: /docs/ops/next-release-notes.md

# Next Release Notes

This file is intentionally kept in the repository so Codex can use it later as a structured source of upcoming changes.

Refresh it from production notes with:

```bash
cd apps/api
ADMIN_SYNC_TOKEN=... npm run export:product-notes
```

## Source Doc: /release/IOS_MEMBERSHIP_NEXT_STEPS.md

# iOS Next Steps After Apple Developer Membership

This project is already prepared as far as possible without an active Apple Developer team.

## What is already done

- Apple ID login was tested through EAS CLI
- Two-factor authentication flow was tested successfully
- iOS local export passes
- iOS simulator route-level QA was run
- App metadata, icon, bundle identifier, and screenshot pack are prepared

## The only current iOS blocker

The Apple account used with EAS does not have access to a paid Apple Developer Program team yet.

Until that exists, EAS cannot generate or validate the credentials needed for:

- internal iOS preview builds
- TestFlight distribution
- App Store submission

## What to do once membership is active

1. Confirm the Apple ID is attached to the paid Apple Developer Program team.
2. Re-run:

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dlx eas-cli build -p ios --profile preview
```

3. Log in to Apple in the terminal when prompted.
4. Complete 2FA again if asked.
5. Let EAS generate or validate the iOS credentials.
6. Wait for the preview build to finish.
7. If preview succeeds, run production:

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dlx eas-cli build -p ios --profile production
```

## App Store classification recommendation

- Primary category: `Finance`
- Secondary fallback if review pushes back: `Utilities`

## App Store metadata already prepared

See:

- `release/STORE_METADATA.md`
- `release/SCREENSHOT_PLAN.md`
- `release/RELEASE_READINESS_STATUS.md`

## Screenshot pack already prepared

- `release/screenshots-ios-preview/01-wallet-home.png`
- `release/screenshots-ios-preview/02-send.png`
- `release/screenshots-ios-preview/03-swap.png`
- `release/screenshots-ios-preview/04-direct-buy.png`
- `release/screenshots-ios-preview/05-airdrop.png`
- `release/screenshots-ios-preview/06-ambassador.jpg`

## Notes

- Before final App Store submission, we should recapture the final approved screenshot set in the target App Store sizes if we want a polished store presentation.
- The project is ready to continue immediately after Apple membership becomes active.

## Source Doc: /release/RELEASE_READINESS_STATUS.md

# Release Readiness Status

Last checked: 2026-05-02 (Asia/Tashkent)

## Current state

The mobile app is locally release-ready from a code and bundling perspective.

### Verified locally

- `pnpm --dir apps/mobile lint`
- `pnpm --dir apps/api lint`
- `cd apps/mobile && npx tsc --noEmit`
- `cd apps/mobile && npx expo-doctor`
- `cd apps/mobile && npx expo export --platform ios`
- `cd apps/mobile && npx expo export --platform android`
- `git diff --check`

### Release config polish completed

- App icon wired from the current 4TEEN brand mark
- App display name set to `4TEEN`
- Store version set to `1.0.0`
- `ITSAppUsesNonExemptEncryption` declared as `false`
- Removed unused Android `RECORD_AUDIO` permission
- Removed EAS channel config that was noisy without `expo-updates`
- Removed local `ios.buildNumber` / `android.versionCode` from app config because EAS remote versioning is enabled
- Fixed Android Metro bundling for `@noble/hashes` via local shim

## Route-level QA checked on iOS simulator

Screens and navigation verified visually:

- Wallet home
- Send
- Swap
- Direct Buy
- Airdrop
- Ambassador
- Control Panel overlay
- Address Book
- Ambassador -> Main navigation

Prepared screenshot pack:

- `release/screenshots-ios-preview/01-wallet-home.png`
- `release/screenshots-ios-preview/02-send.png`
- `release/screenshots-ios-preview/03-swap.png`
- `release/screenshots-ios-preview/04-direct-buy.png`
- `release/screenshots-ios-preview/05-airdrop.png`
- `release/screenshots-ios-preview/06-ambassador.jpg`

See also:

- `release/SCREENSHOT_PLAN.md`

## External blockers only

### Apple / iOS

The Apple ID login and 2FA flow works, but App Store / TestFlight distribution is blocked until the Apple account has access to a paid Apple Developer Program team.

Current blocker:

- no Apple Developer team associated with the authenticated Apple account

### Store pages

Public pages now exist and were verified live:

- `https://4teen.me/privacy`
- `https://4teen.me/terms`
- `https://4teen.me/support`

## Notes

- Android cloud preview build was re-run after the Metro shim fix and release-config cleanup.
- Latest Android preview build:
  - `989e96bf-b39a-4d14-b79b-747f6a6d58b4`
  - `https://expo.dev/accounts/4teendev/projects/4teen-wallet/builds/989e96bf-b39a-4d14-b79b-747f6a6d58b4`
- The latest Android preview build now uses the updated fingerprint and no longer carries the earlier `runtimeVersion` warning path in its metadata.
- Android production build has also been started:
  - `462c039f-fd0d-449e-b34d-0cac6aa09f92`
  - `https://expo.dev/accounts/4teendev/projects/4teen-wallet/builds/462c039f-fd0d-449e-b34d-0cac6aa09f92`
- If a cloud build still fails after local exports are green, the next inspection target is the uploaded EAS job log rather than the local app code path.

## Source Doc: /release/SCREENSHOT_PLAN.md

# Store Screenshot Pack

Prepared from the current iOS build and saved in:

- `release/screenshots-ios-preview/01-wallet-home.png`
- `release/screenshots-ios-preview/02-send.png`
- `release/screenshots-ios-preview/03-swap.png`
- `release/screenshots-ios-preview/04-direct-buy.png`
- `release/screenshots-ios-preview/05-airdrop.png`
- `release/screenshots-ios-preview/06-ambassador.jpg`

Recommended narrative order for store listings:

1. `Wallet Home`
   - shows portfolio card, primary actions, and asset list
2. `Send`
   - shows recipient flow and transfer confirmation CTA
3. `Swap`
   - shows token switching and route-aware exchange flow
4. `Direct Buy`
   - shows buy amount, receive amount, and protocol surfaces
5. `Airdrop`
   - shows social airdrop availability and wallet-linked reward flow
6. `Ambassador`
   - shows referral dashboard, claimable rewards, and sharing tools

Notes:

- These are strong preview screenshots for internal review and store copy planning.
- Before final App Store submission, we should recapture the final approved set on the target device size we want to submit with.
- If we want marketing polish, the next pass should add short overlay captions in a separate asset pipeline rather than editing raw simulator screenshots.

## Source Doc: /release/STORE_METADATA.md

# 4TEEN Store Metadata

Last updated: 2026-05-02

## Identity

- Product name: `4TEEN`
- Internal product label: `4TEEN Wallet`
- Store positioning: `Ecosystem connector`
- Expo slug: `4teen-wallet`
- iOS bundle identifier: `me.fourteen.wallet`
- Android package: `me.fourteen.wallet`
- Version: `1.0.0`

## App Store

- App name: `4TEEN`
- Subtitle:
  `Wallet & ecosystem connector`
- Promotional text:
  `Buy, swap, manage wallets, and move through the 4TEEN ecosystem from one mobile wallet.`
- Short description angle:
  `A direct access wallet for 4TEEN buys, swaps, protocol flows, and wallet management on TRON.`

## Google Play

- App name: `4TEEN`
- Short description:
  `Wallet and ecosystem connector for the 4TEEN protocol.`
- Full description:
  `4TEEN is a mobile wallet and ecosystem connector for direct buys, swaps, wallet access, protocol views, and on-chain actions across the 4TEEN system on TRON.

Core capabilities:
- Create, import, and manage full-access or watch-only wallets
- Send and receive supported assets
- Swap supported tokens from inside the wallet
- Access direct-buy and protocol information surfaces
- Review unlock timelines, liquidity flows, airdrop progress, and ambassador status
- Secure sensitive actions with passcode and biometric protection

4TEEN is designed for users who want a wallet experience tied closely to the 4TEEN ecosystem rather than a generic token shell.`

## Keywords / ASO Seed

Use these as a starting point, not as a final ASO set:

- 4TEEN
- wallet
- crypto wallet
- TRON wallet
- token swap
- direct buy
- web3 wallet
- ambassador
- airdrop
- ecosystem

## URLs

- Marketing website:
  `https://4teen.me`
- API base:
  `https://api.4teen.me`
- GitHub org:
  `https://github.com/info14fourteen-creator`
- Discord:
  `https://discord.gg/jWZF6KzPCB`
- Instagram:
  `https://instagram.com/fourteentoken`
- Telegram:
  `https://t.me/fourteentoken`

## Legal / Support

- Terms route exists in-app:
  `/terms`
- Whitepaper route exists in-app:
  `/whitepaper`

- Privacy policy:
  `https://4teen.me/privacy`
- Terms:
  `https://4teen.me/terms`
- Support:
  `https://4teen.me/support`

Verified live on 2026-05-02.

## Suggested Store Classification

### Apple App Store

- Primary category:
  `Finance`
- Secondary fallback if review pushes back:
  `Utilities`

### Google Play

- App category:
  `Finance`

Rationale:

- The product is a non-custodial wallet and protocol-facing transaction surface.
- Even though it includes protocol information pages and ecosystem routes, the user-facing core remains wallet access, token movement, swaps, and on-chain finance-adjacent activity.

## Screenshot Plan

Current UI audit screenshots were archived locally during release cleanup. Before submission we should capture fresh store screenshots from the current build.

Recommended first batch:

- iPhone 6.9":
  - wallet home
  - send
  - swap
  - buy
  - ambassador / info / airdrop
- Android phone:
  - wallet home
  - send
  - swap
  - buy

## Notes

- Home-screen name is intentionally short: `4TEEN`
- Longer wording such as `Wallet` or `Ecosystem Connector` should live in store metadata, not in the launcher label
- `icon.png` was regenerated from the website SVG and is now the current primary app icon

## Source Doc: /release/STORE_RELEASE_CHECKLIST.md

# 4TEEN Store Release Checklist

## Config

- [x] Set short app display name to `4TEEN`
- [x] Set iOS bundle identifier to `me.fourteen.wallet`
- [x] Set Android package to `me.fourteen.wallet`
- [x] Set app version to `1.0.0`
- [x] Enable EAS remote app versioning
- [x] Wire main app icon
- [x] Add `eas.json`
- [x] Add `.easignore`

## Verification

- [x] `pnpm --dir apps/mobile lint`
- [x] `npx expo-doctor`
- [x] `npx expo export --platform ios`
- [x] `npx expo export --platform android`

## Still Needed Before Store Submission

- [x] Publish privacy policy page and final URL
- [x] Publish support page or final support URL
- [ ] Decide final store subtitle / short description wording
- [ ] Capture fresh App Store screenshots
- [ ] Capture fresh Google Play screenshots
- [x] Log in to Expo / EAS
- [x] Link project to Expo account
- [ ] Finish Android preview build
- [ ] Finish Android production build
- [ ] Finish iOS preview build
- [ ] Finish iOS production build
- [ ] Submit iOS build to TestFlight
- [ ] Submit Android build to Play Internal Testing

## Build Commands

From `apps/mobile`:

```bash
pnpm dlx eas-cli whoami
pnpm dlx eas-cli build -p ios --profile preview
pnpm dlx eas-cli build -p android --profile preview
pnpm dlx eas-cli build -p ios --profile production
pnpm dlx eas-cli build -p android --profile production
pnpm dlx eas-cli submit -p ios --profile production
pnpm dlx eas-cli submit -p android --profile production
```

## Known Non-Store Blockers

- Web export still needs the `lottie-react-native` web dependency path fixed
- Noble hash export warnings still appear during bundling, but they do not currently block iOS or Android export

## Source Doc: /archive/README.md

Repository-local archive for backup snapshots, temporary UI audits, and other non-runtime artifacts moved out of the active app tree during release preparation.