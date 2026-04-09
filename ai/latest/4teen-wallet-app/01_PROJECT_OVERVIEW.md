# 4teen-wallet-app — PROJECT OVERVIEW

Generated: 2026-04-09T14:21:23.087Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: eaabbdc0b75bb2eca377f96b2422a927a9c602ab
Short commit: eaabbdc
Commit subject: chore: update wallet AI bundle [skip ci]
Commit author: github-actions[bot]
Commit date: 2026-04-08T03:40:40Z

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
      - font-lab.tsx
      - index.tsx
      - modal.tsx
      - terms.tsx
      - ui-lab.tsx
      - whitepaper.tsx
    - assets/
      - icons/
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
          - close.svg
          - info_btn.svg
          - logo_white.svg
          - menu.svg
          - scan.svg
          - search.svg
          - setings_btn.svg
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
      - reset-project.js
      - update-version.mjs
    - src/
      - config/
        - app-version.ts
      - notice/
        - notice-provider.tsx
      - theme/
        - tokens.ts
        - ui.ts
      - ui/
        - app-header.tsx
        - foundation.tsx
        - menu-sheet.tsx
        - submenu-header.tsx
        - top-chrome.tsx
    - app.json
    - eslint.config.js
    - metro.config.js
    - package.json
    - README.md
    - svg.d.ts
    - tsconfig.json
- scripts/
  - build-wallet-ai-bundles.mjs
- package.json
- pnpm-workspace.yaml
- turbo.json
```

## Included files

- package.json

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
