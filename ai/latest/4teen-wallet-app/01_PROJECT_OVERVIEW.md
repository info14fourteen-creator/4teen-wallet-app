# 4teen-wallet-app — PROJECT OVERVIEW

Generated: 2026-04-07T16:44:08.653Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: 996d513c37d9f52110f5307aa4059f38bc692f6c
Short commit: 996d513
Commit subject: chore: add wallet AI bundle snapshot automation
Commit author: info14fourteen-creator
Commit date: 2026-04-07T21:43:58+05:00

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
      - modal.tsx
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
    - app.json
    - eslint.config.js
    - package.json
    - README.md
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
