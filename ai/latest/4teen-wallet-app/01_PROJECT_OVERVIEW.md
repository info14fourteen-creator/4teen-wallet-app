# 4teen-wallet-app — PROJECT OVERVIEW

Generated: 2026-05-02T23:39:25.077Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: f915f2bbd5477c686b459706f39f0dfb07781e5e
Short commit: f915f2b
Commit subject: Normalize Telegram oga voice files for transcription
Commit author: info14fourteen-creator
Commit date: 2026-05-03T04:39:14+05:00

## Curated project tree

```txt
- .github/
  - scripts/
    - ops-remote-runner.mjs
  - workflows/
    - build-wallet-ai-bundle.yml
    - ci.yml
    - ops-remote-runner.yml
- apps/
  - api/
    - src/
      - config/
        - env.js
      - db/
        - queries/
          - ambassadorCabinet.js
          - ambassadors.js
          - buyerBindings.js
          - buyers.js
          - purchases.js
        - pool.js
      - routes/
        - airdrop.js
        - ambassador.js
        - gasstation.js
        - health.js
        - ops.js
        - proxy.js
        - resources.js
        - site.js
        - wallet.js
      - services/
        - airdrop/
          - telegramBot.js
          - telegramClaims.js
        - ambassador/
          - controller.js
          - reconcilePurchase.js
          - replayPending.js
          - replayQueue.js
          - resourceGate.js
          - sync.js
          - token.js
        - gasstation/
          - energyResale.js
          - gasStation.js
          - notifications.js
        - ops/
          - codexJobs.js
          - events.js
          - executionRequests.js
          - githubOidc.js
          - githubRemoteRunner.js
          - knowledgeBase.js
          - monitor.js
          - openai.js
          - productNotes.js
          - remoteApplyPlan.js
          - remoteRunner.js
          - resourceSignals.js
          - screeners.js
          - store.js
          - tasks.js
          - telegramAdminBot.js
        - proxy/
          - apiProxy.js
          - walletSnapshot.js
        - publicData/
          - siteData.js
        - tron/
          - client.js
          - payments.js
      - app.js
    - clock.js
    - package.json
    - server.js
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
      - ambassador-confirm.tsx
      - ambassador-program.tsx
      - ambassador-withdraw-confirm.tsx
      - appearance.tsx
      - authentication-method.tsx
      - backup-private-key.tsx
      - browser.tsx
      - buy-4teen.tsx
      - buy-confirm.tsx
      - buy.tsx
      - confirm-passcode.tsx
      - connections.tsx
      - create-passcode.tsx
      - create-wallet.tsx
      - currency.tsx
      - earn.tsx
      - enable-biometrics.tsx
      - export-mnemonic.tsx
      - feedback.tsx
      - font-lab.tsx
      - home.tsx
      - import-private-key.tsx
      - import-seed.tsx
      - import-wallet.tsx
      - import-watch-only.tsx
      - index.tsx
      - language.tsx
      - liquidity-confirm.tsx
      - liquidity-controller.tsx
      - manage-crypto.tsx
      - modal.tsx
      - multisig-transactions.tsx
      - scan.tsx
      - select-wallet.tsx
      - send-confirm.tsx
      - send.tsx
      - settings.tsx
      - swap-confirm.tsx
      - swap.tsx
      - terms.tsx
      - token-details.tsx
      - ui-lab.tsx
      - ui-shell-lab.tsx
      - ui-shell-test-a.tsx
      - ui-shell-test-b.tsx
      - unlock-timeline.tsx
      - unlock.tsx
      - wallet-access.tsx
      - wallet-manager.tsx
      - wallet.tsx
      - wallets.tsx
      - whitepaper.tsx
    - assets/
      - icons/
        - footer/
          - airdrop_footer.svg
          - ambassador_footer.svg
          - buy_footer.svg
          - footer_airdrop_idle_v4.json
          - footer_airdrop_idle_v6.json
          - footer_airdrop_idle_v7.json
          - footer_airdrop_idle.json
          - footer_airdrop_press_v4.json
          - footer_airdrop_press_v6.json
          - footer_airdrop_press_v7.json
          - footer_airdrop.json
          - footer_ambassador_idle_v3.json
          - footer_ambassador_idle_v4.json
          - footer_ambassador_idle_v5.json
          - footer_ambassador_idle_v6.json
          - footer_ambassador_idle_v7.json
          - footer_ambassador_idle.json
          - footer_ambassador_press_v4.json
          - footer_ambassador_press_v5.json
          - footer_ambassador_press_v6.json
          - footer_ambassador_press_v7.json
          - footer_ambassador_v2.json
          - footer_ambassador.json
          - footer_buy_idle_v3.json
          - footer_buy_idle_v4.json
          - footer_buy_idle_v5.json
          - footer_buy_idle_v6.json
          - footer_buy_idle_v7.json
          - footer_buy_idle_v8.json
          - footer_buy_idle.json
          - footer_buy_press_v4.json
          - footer_buy_press_v5.json
          - footer_buy_press_v6.json
          - footer_buy_press_v7.json
          - footer_buy_press_v8.json
          - footer_buy_v2.json
          - footer_buy.json
          - footer_earn_green_v2.json
          - footer_earn_green.json
          - footer_earn_orange_v2.json
          - footer_earn_orange.json
          - footer_earn.json
          - footer_home_orange.json
          - footer_home_red.json
          - footer_home.json
          - footer_info_idle.json
          - footer_info_static.json
          - footer_info.json
          - footer_liquidity_idle.json
          - footer_liquidity_static.json
          - footer_liquidity.json
          - footer_send.json
          - footer_swap.json
          - footer_unlock_idle.json
          - footer_unlock_static.json
          - footer_unlock.json
          - swap_footer.svg
        - header/
          - header_qr.json
        - scan/
          - scan_gallery.json
        - search/
          - search_close.json
          - search_magnifier.json
        - ui/
          - add_contact_btn.svg
          - add_wallet_btn.svg
          - address_btn.svg
          - airdrop_qp_btn.svg
          - ambassador_qp_btn.svg
          - assets_btn.svg
          - az_sort_btn.svg
          - backspace_btn.svg
          - biologin_btn.svg
          - brow_back_arrow_slide.json
          - brow_select_wallet_close.json
          - brow_wallet_access_wallet.json
          - brow_wallet_asset_view.json
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
          - connections_info_arrow_down.json
          - connections_info_cross.json
          - copy_btn.svg
          - create_add_wallet_qp_btn.svg
          - decline_btn.svg
          - earn_footer_menu_btn_onclick.svg
          - earn_footer_menu_btn.svg
          - footer_menu.svg
    - app.json
- docs/
  - ai-snapshots/
    - 2026-04-09-wallet-home-wired.md
    - 2026-04-09-wallet-import-state.md
  - ops/
    - access-map.json
    - access-map.md
    - knowledge-base.md
    - next-release-notes.md
    - repo-map.md
- scripts/
  - build-wallet-ai-bundles.mjs
  - ops-remote-runner.mjs
- package.json
```

## Included files

- docs/ai-snapshots/2026-04-09-wallet-home-wired.md
- docs/ai-snapshots/2026-04-09-wallet-import-state.md
- docs/ops/access-map.json
- docs/ops/access-map.md
- docs/ops/knowledge-base.md
- docs/ops/next-release-notes.md
- docs/ops/repo-map.md
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

`docs/ops/access-map.json`

## FILE CONTENT

```json
{
  "generatedAt": "2026-05-02T00:30:00Z",
  "workspace": {
    "path": "/Users/stanataev/4teen-wallet-app",
    "branch": "main",
    "commit": "1279df7"
  },
  "verifiedAccess": {
    "originRead": true,
    "herokuRemotePresent": true,
    "herokuAppInfo": true,
    "herokuConfigRead": true,
    "herokuProcessRead": true,
    "herokuDeployPathAvailable": true,
    "originWriteVerified": false,
    "crossRepoAccessVerified": false
  },
  "projects": [
    {
      "repoName": "4teen-wallet-app",
      "localPath": "/Users/stanataev/4teen-wallet-app",
      "originUrl": "https://github.com/info14fourteen-creator/4teen-wallet-app.git",
      "defaultBranch": "main",
      "herokuApp": "fourteen-wallet-api",
      "herokuGitUrl": "https://git.heroku.com/fourteen-wallet-api.git",
      "webUrl": "https://fourteen-wallet-api-7af291023d36.herokuapp.com/",
      "region": "us",
      "stack": "heroku-24",
      "dynos": [
        {
          "name": "web",
          "command": "pnpm --dir apps/api start",
          "verifiedUp": true
        },
        {
          "name": "clock",
          "command": "node apps/api/clock.js",
          "verifiedUp": true
        }
      ],
      "docs": [
        "/Users/stanataev/4teen-wallet-app/docs/ops/repo-map.md",
        "/Users/stanataev/4teen-wallet-app/docs/ops/knowledge-base.md",
        "/Users/stanataev/4teen-wallet-app/docs/ops/next-release-notes.md"
      ]
    }
  ],
  "minimumMissingForAutomation": [
    "HEROKU_API_KEY",
    "HEROKU_EMAIL",
    "GitHub write access for target repos",
    "Cross-project repo/app map",
    "Branch policy for Codex changes",
    "Production deploy policy"
  ],
  "recommendedRunnerFlow": [
    "Read task from ops_tasks",
    "Resolve target repo/app from access map",
    "Create work branch or worktree",
    "Apply code changes",
    "Run verification",
    "Deploy or open PR depending on policy",
    "Write result back to Postgres"
  ]
}
```

---

## FILE PATH

`docs/ops/access-map.md`

## FILE CONTENT

```md
# 4TEEN Codex Access Map

Generated at: 2026-05-02T00:30:00Z

## What Is Verified Right Now

This map describes what Codex can already access for the current 4TEEN project from the current machine and what is still missing for a fully automatic ticket-to-code workflow.

### Verified In This Session

- Workspace path: `/Users/stanataev/4teen-wallet-app`
- Primary repo: `4teen-wallet-app`
- Observed branch in local workspace: `main`
- Observed local commit: `1279df7`
- GitHub remote `origin`: `https://github.com/info14fourteen-creator/4teen-wallet-app.git`
- Heroku remote: `https://git.heroku.com/fourteen-wallet-api.git`
- Heroku app: `fourteen-wallet-api`
- Heroku web URL: `https://fourteen-wallet-api-7af291023d36.herokuapp.com/`
- Heroku stack: `heroku-24`
- Heroku region: `us`
- Dynos confirmed up:
  - `web: pnpm --dir apps/api start`
  - `clock: node apps/api/clock.js`
- Heroku config access: confirmed
- Git read access to `origin`: confirmed with `git ls-remote --heads origin`
- Heroku app inspection: confirmed with `heroku apps:info -a fourteen-wallet-api`
- Heroku process inspection: confirmed with `heroku ps -a fourteen-wallet-api`
- Heroku git deploy path: confirmed in this environment

## Current Repo To App Mapping

### Main Wallet Project

- Repo name: `4teen-wallet-app`
- Local path: `/Users/stanataev/4teen-wallet-app`
- Git remote `origin`: `https://github.com/info14fourteen-creator/4teen-wallet-app.git`
- Main app runtime:
  - `web -> fourteen-wallet-api`
  - `clock -> fourteen-wallet-api`
- Procfile:
  - `web: pnpm --dir apps/api start`
  - `clock: node apps/api/clock.js`
- Main ops docs already in repo:
  - [repo-map.md](/Users/stanataev/4teen-wallet-app/docs/ops/repo-map.md)
  - [knowledge-base.md](/Users/stanataev/4teen-wallet-app/docs/ops/knowledge-base.md)
  - [next-release-notes.md](/Users/stanataev/4teen-wallet-app/docs/ops/next-release-notes.md)

## What Codex Already Has

For this project, Codex already has enough to:

- inspect the local repo
- read and edit code in the local workspace
- inspect the Git remotes
- inspect the Heroku app
- inspect Heroku dyno state
- read selected Heroku config presence
- deploy this project to `fourteen-wallet-api` through the configured `heroku` git remote

That means Codex can already work on:

- repo analysis
- code changes
- ops bot changes
- API changes
- Heroku deploys for the current app

## What Is Not Fully Guaranteed Yet

These items are not yet fully guaranteed for an autonomous Codex runner across all your projects:

- write access to every other GitHub repo you own
- write access to every Heroku app you own
- a persistent machine-readable map for all repos and apps outside this project
- a dedicated runner identity for non-interactive GitHub pushes and Heroku actions
- a verified server-side workflow that takes `ops_tasks` from Postgres and closes them automatically in real repos

## Minimum Missing Access For Full Automation

To let a future Codex runner reliably take a DB task and close it as real code work, the minimum missing pieces are:

- `HEROKU_API_KEY`
- `HEROKU_EMAIL`
- GitHub write access for the repos that Codex should modify
- a global repo/app map for every project you want included
- a safe rule for which branch Codex should use by default
- a safe rule for whether Codex can deploy directly to production or only prepare a patch/branch/PR

## Recommended Safe Deployment Model

For your setup, the safest model is:

1. Codex reads a task from `ops_tasks`.
2. Codex resolves the target repo and target app from an access map.
3. Codex creates a work branch or worktree.
4. Codex applies code changes.
5. Codex runs local verification.
6. Codex either:
   - opens a branch/PR, or
   - deploys to the mapped Heroku app if the task is explicitly allowed to deploy.
7. Codex writes the result back to Postgres as `done` or `blocked`.

## Recommended Global Access Map Format

For every additional project, add an entry with:

- repo name
- local workspace path
- GitHub remote URL
- default branch
- Heroku app name
- deploy type
- allowed environments
- notes about secrets or risky operations

## Honest Boundary

For the current wallet project, the access is already good enough for Codex-assisted work and Heroku deploys from this machine.

For a true automatic multi-repo Codex worker, this project still needs:

- one shared cross-project access map
- one dedicated automation identity for GitHub and Heroku
- one explicit policy for production deploy permission
```

---

## FILE PATH

`docs/ops/knowledge-base.md`

## FILE CONTENT

```md
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
```

---

## FILE PATH

`docs/ops/next-release-notes.md`

## FILE CONTENT

```md
# Next Release Notes

This file is intentionally kept in the repository so Codex can use it later as a structured source of upcoming changes.

Refresh it from production notes with:

```bash
cd apps/api
ADMIN_SYNC_TOKEN=... npm run export:product-notes
```
```

---

## FILE PATH

`docs/ops/repo-map.md`

## FILE CONTENT

```md
# 4TEEN Repo Map

Generated at: 2026-05-01T23:33:48.882Z

## Mobile Screens
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

## API Routes
- /apps/api/src/routes/airdrop.js
- /apps/api/src/routes/ambassador.js
- /apps/api/src/routes/gasstation.js
- /apps/api/src/routes/health.js
- /apps/api/src/routes/ops.js
- /apps/api/src/routes/proxy.js
- /apps/api/src/routes/resources.js
- /apps/api/src/routes/wallet.js

## Ops Services
- /apps/api/src/services/ops/codexJobs.js
- /apps/api/src/services/ops/events.js
- /apps/api/src/services/ops/knowledgeBase.js
- /apps/api/src/services/ops/monitor.js
- /apps/api/src/services/ops/openai.js
- /apps/api/src/services/ops/productNotes.js
- /apps/api/src/services/ops/screeners.js
- /apps/api/src/services/ops/store.js
- /apps/api/src/services/ops/tasks.js
- /apps/api/src/services/ops/telegramAdminBot.js
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
  },
  "dependencies": {
    "expo-crypto": "~15.0.9"
  }
}
```
