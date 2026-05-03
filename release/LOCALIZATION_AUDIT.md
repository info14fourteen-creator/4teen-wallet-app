# Localization Audit

Scope: full product-facing route surface in `apps/mobile/app`.

Included:
- onboarding and access
- wallet core
- send / swap / buy
- protocol / earn / ambassador / liquidity
- settings / app shell / docs surfaces
- export / security screens
- utility screens that users can actually reach

Excluded:
- old Expo starter tabs under `(tabs)/`
- pure lab / test routes that are not part of the shipped product path

Status meanings:
- `not_started` — screen not audited yet
- `in_progress` — screen under active wording/composition review
- `done` — obvious composition/runtime wording issues reviewed and cleaned

## Access & Onboarding

| Screen | Status | Notes |
| --- | --- | --- |
| `wallet-access.tsx` | `in_progress` | No-wallet entry path under full route audit |
| `ui-lab.tsx` | `in_progress` | Hero composition fixed; slider copy moved into translatable onboarding slice |
| `import-wallet.tsx` | `in_progress` | Option copy moved under route-level onboarding audit |
| `create-wallet.tsx` | `in_progress` | `Verify 3 words` composition removed; helper copy now under onboarding slice |
| `import-seed.tsx` | `in_progress` | Heading reviewed; helper copy now under onboarding slice |
| `import-private-key.tsx` | `in_progress` | Full title key used; helper copy now under onboarding slice |
| `import-watch-only.tsx` | `in_progress` | Heading reviewed; helper copy now under onboarding slice |
| `create-passcode.tsx` | `in_progress` | Passcode flow under wording audit |
| `confirm-passcode.tsx` | `in_progress` | Passcode flow under wording audit; RTL-safe text alignment added |
| `enable-biometrics.tsx` | `in_progress` | `Enable/Disable {{label}}` composition fixed |
| `unlock.tsx` | `in_progress` | Unlock CTA composition normalized; auth copy still under wording audit |
| `authentication-method.tsx` | `in_progress` | Auth wording under route-level review; RTL-safe text alignment added |
| `language.tsx` | `in_progress` | Language route copy reviewed; shell-free no-wallet path validated; RTL-safe list alignment added |
| `index.tsx` | `not_started` | Boot / loading / route-decision copy audit pending |

## Wallet Core

| Screen | Status | Notes |
| --- | --- | --- |
| `wallet.tsx` | `in_progress` | Empty-state and wallet-action wording under route-level review |
| `wallets.tsx` | `in_progress` | Wallet manager copy and watch-only balance notes under wording pass |
| `select-wallet.tsx` | `in_progress` | Selector empty-state and wallet-opening copy under wording pass |
| `manage-crypto.tsx` | `in_progress` | Asset-empty wording and token-management tone under review |
| `token-details.tsx` | `in_progress` | History / market / contract wording under review |
| `add-custom-token.tsx` | `not_started` |  |
| `address-book.tsx` | `in_progress` | Contact actions and empty-state copy under route-level review |
| `connections.tsx` | `in_progress` | Connections-specific copy pulled into dedicated i18n slice across all languages |
| `multisig-transactions.tsx` | `not_started` |  |
| `wallet-manager.tsx` | `not_started` |  |

## Transfer & Trading

| Screen | Status | Notes |
| --- | --- | --- |
| `send.tsx` | `in_progress` | Route helper copy moved under shared route-copy slice |
| `send-confirm.tsx` | `not_started` |  |
| `swap.tsx` | `in_progress` | Route helper copy moved under shared route-copy slice |
| `swap-confirm.tsx` | `not_started` |  |
| `buy.tsx` | `in_progress` | Route helper copy moved under shared route-copy slice |
| `buy-confirm.tsx` | `not_started` |  |
| `buy-4teen.tsx` | `not_started` |  |
| `scan.tsx` | `not_started` |  |
| `modal.tsx` | `not_started` | Utility surface; confirm text and fallback labels pending |

## Protocol & Earn

| Screen | Status | Notes |
| --- | --- | --- |
| `earn.tsx` | `in_progress` | Contract-map body labels moved under dedicated protocol-map slice; runtime energy/bandwidth labels now localizable |
| `airdrop.tsx` | `in_progress` | Long helper copy moved under shared route-copy slice |
| `ambassador-program.tsx` | `not_started` |  |
| `ambassador-confirm.tsx` | `not_started` |  |
| `ambassador-withdraw-confirm.tsx` | `not_started` |  |
| `unlock-timeline.tsx` | `not_started` |  |
| `liquidity-controller.tsx` | `not_started` |  |
| `liquidity-confirm.tsx` | `not_started` |  |

## Security & Export

| Screen | Status | Notes |
| --- | --- | --- |
| `backup-private-key.tsx` | `in_progress` | Export helper copy moved under shared route-copy slice; export heading now covered across all languages |
| `export-mnemonic.tsx` | `in_progress` | Export helper copy moved under shared route-copy slice; export heading now covered across all languages |

## Settings & App Shell

| Screen | Status | Notes |
| --- | --- | --- |
| `settings.tsx` | `not_started` |  |
| `currency.tsx` | `not_started` |  |
| `browser.tsx` | `not_started` |  |
| `home.tsx` | `in_progress` | Product-hub copy under route-level wording pass |
| `appearance.tsx` | `not_started` | Small copy surface |
| `about.tsx` | `in_progress` | Feedback CTA source wording normalized |
| `feedback.tsx` | `in_progress` | Feedback type labels and helper copy translated across all languages |

## Shared RTL

| Surface | Status | Notes |
| --- | --- | --- |
| `src/i18n/index.tsx` | `in_progress` | Added `isRtlLanguage()` and shared locale-layout helper |
| `src/ui/product-shell.tsx` | `in_progress` | Shared product screens now respect RTL text alignment and row mirroring |
| `src/ui/screen-brow.tsx` | `in_progress` | Brow label clusters and back action now support RTL layout |
| `src/ui/settings-row.tsx` | `in_progress` | RTL-aware text and chevrons |
| `src/ui/selected-wallet-switcher.tsx` | `in_progress` | RTL-aware wallet switcher layout and chevrons |

## Product / Docs Surfaces

| Screen | Status | Notes |
| --- | --- | --- |
| `whitepaper.tsx` | `not_started` |  |
| `terms.tsx` | `not_started` |  |

## Utility / Reachable Extras

| Screen | Status | Notes |
| --- | --- | --- |
| `font-lab.tsx` | `excluded` | Lab route, not product-facing |
| `ui-shell-lab.tsx` | `excluded` | Lab route, not product-facing |
| `ui-shell-test-a.tsx` | `excluded` | Lab route, not product-facing |
| `ui-shell-test-b.tsx` | `excluded` | Lab route, not product-facing |
| `(tabs)/index.tsx` | `excluded` | Expo starter route |
| `(tabs)/explore.tsx` | `excluded` | Expo starter route |
| `(tabs)/_layout.tsx` | `excluded` | Expo starter route |
