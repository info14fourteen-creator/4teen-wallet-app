# 4teen-wallet-app — PROJECT OVERVIEW

Generated: 2026-04-07T22:49:04.085Z
Repository: info14fourteen-creator/4teen-wallet-app
Branch: main
Last commit: ba7af575d7d4b571d6b042ed7839cb35242f6d55
Short commit: ba7af57
Commit subject: feat: add local UI icons for mobile shell
Commit author: info14fourteen-creator
Commit date: 2026-04-08T03:48:51+05:00

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
      - index.tsx
      - modal.tsx
    - assets/
      - icons/
        - ui/
          - close.svg
          - menu.svg
          - scan.svg
          - search.svg
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
