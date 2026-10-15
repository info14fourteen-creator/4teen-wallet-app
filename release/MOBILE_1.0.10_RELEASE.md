# 4TEEN 1.0.10 — UI parity work in progress

15 October 2026 (Asia/Tashkent). This is a **device-QA candidate, not approved for store submission**. One 1.0.10 EAS production-profile build per platform was started; no 1.0.10 store upload or review submission has been started. Existing 1.0.9 submissions are unchanged.

## Verified so far

- Expo and mobile package marketing version set to 1.0.10; EAS remotely incremented Android versionCode to 22 and iOS buildNumber to 24.
- Footer labels use a single line and shrink/ellipsize rather than wrap. iPhone simulator checked on Wallet, SWAP, Airdrop, Ambassador, Unlock, Liquidity, and Info routes.
- iOS Unlock Timeline, Liquidity Controller, and Info now resolve to the shared Android-style screens instead of the simplified iOS replacements. iOS BUY CTA is hidden on Unlock; liquidity execution is hidden on iOS. On-chain data and layout appeared on the iPhone simulator.
- iOS Airdrop now reads the shared on-chain social status and Telegram overview and renders social cards in the Android style. This remains read-only; no claim/session action is exposed. The visible portion of the cards was checked on the simulator.
- BUY and SWAP now use Android-like amount/asset rows on iOS while clearly separating wallet balances from transaction amounts; quote, mint and signing controls remain unavailable. The SWAP screen was checked on the iPhone simulator. The full lower page has not yet been verified by a successful scroll gesture.
- iOS Ambassador shows more cabinet fields when a profile exists, but its no-profile state still differs from Android because iOS registration is unavailable. It needs product review.
- Shared Home hub was adapted for iOS, but the footer MAIN route opens Wallet, not `/home`; that hub has not been visually reviewed in navigation.
- Transaction-note behavior remains covered by mobile unit tests. 167 mobile tests, TypeScript, lint, and diff whitespace checks passed after these changes. iOS and Android Hermes exports passed before the later visual-parity edits and must be rerun.

## Blocking before a production build

1. Complete BUY and SWAP visual parity beyond the current read-only layout; Android has interactive quotes and purchase amounts that iOS cannot honestly display as executable. Do not imply a purchase can complete on iOS if it cannot.
2. Review Ambassador and Airdrop against Android on real data and small-screen/large-text layouts. Verify full scroll to the last card above the footer; Simulator UI automation did not complete this gesture.
3. Reconcile the stale `apps/mobile/store.config.json` (still 1.0.6), and prepare accurate 1.0.10 release notes/screenshots. Do not reuse 1.0.6 screenshots or review claims.
4. Verify the in-progress signed EAS builds. Do not submit either binary until the user has seen and accepted the screens and the metadata is current.

## 15 October 2026 QA continuation

- 167 mobile tests, `npx tsc --noEmit`, `npx eslint app src --quiet`, `git diff --check`, and both iOS/Android Hermes exports pass after the latest BUY/SWAP/Airdrop/Ambassador changes.
- EAS Android 1.0.10 (22) build `9e959774-9f33-4758-b6d9-c3bb26df7ee6` and iOS 1.0.10 (24) build `708d9ab6-93a0-4bf1-8774-5fa0eeefdc86` both started and returned `IN_PROGRESS`. Build artifacts and installation are not yet verified. The signing profile is `production`, but no upload to either store was requested or performed.
- iOS build `708d9ab6-93a0-4bf1-8774-5fa0eeefdc86` subsequently finished. IPA: https://expo.dev/artifacts/eas/PYrXEBnXwJFbREHIGA_2DyfBBcqB48t2xasPlyTD4e8.ipa . Android build remains in progress at this observation.
- Those first attempts are **superseded** because `src/config/app-version.ts` still reported 1.0.9 inside the app. Android attempt `9e959774-9f33-4758-b6d9-c3bb26df7ee6` was cancelled; iOS attempt `708d9ab6-93a0-4bf1-8774-5fa0eeefdc86` finished but must not be distributed. The version source was corrected to 1.0.10 and verified with `getFullVersionString()`.
- Corrected EAS production-profile builds started: Android 1.0.10 (23) `6dd7aba0-90bf-4c5a-a836-9fd0b5709d5d`; iOS 1.0.10 (25) `7c1eff97-1f19-4b78-a996-9e3c55583bad`. Both were only queued at this entry; no App Store Connect or Google Play submission was performed.
- Corrected iOS 1.0.10 (25) build `7c1eff97-1f19-4b78-a996-9e3c55583bad` finished. IPA: https://expo.dev/artifacts/eas/8CuUefMLyP8n5Qrvl2riQucarns1nKk0bJqA8TobXe0.ipa . Android (23) still `IN_PROGRESS` at this observation.
- Corrected Android 1.0.10 (23) build `6dd7aba0-90bf-4c5a-a836-9fd0b5709d5d` finished. AAB: https://expo.dev/artifacts/eas/UG-R7cntuFunEPd5H_FmvhPhE6MqSJC53JOY7jyXIAU.aab . Both final artifact URLs returned HTTP 200 on a HEAD check. Neither binary has been installed on a physical device or uploaded to a store in this task.
- Final source checks: 167/167 mobile tests, including 36 transaction-note tests, TypeScript and lint pass. iOS and Android Hermes exports succeeded. Simulator visual pass covered Wallet, BUY, SWAP, Airdrop, Ambassador empty state, Unlock, Liquidity and Info. Full-scroll gesture was not verified; iOS Ambassador still differs from Android because registration and signing remain disabled. 1.0.6 store metadata/screenshots remain stale. These are **QA builds**, not a store-ready declaration.

## Draft update text — not submitted

- English: Improved navigation and screen layout, including single-line bottom labels. Refined wallet activity and on-chain protocol views. On iOS, BUY and SWAP display wallet information without offering purchase or exchange transactions. Minor stability improvements.
- Русский: Улучшены навигация и расположение элементов, включая нижнее меню без переноса подписей. Доработаны история кошелька и просмотр данных протокола. На iOS экраны BUY и SWAP показывают информацию кошелька, но не проводят покупку или обмен. Повышена стабильность.

Screenshots must be captured from the final binary and reviewed before any store submission; the 1.0.6 paths in `store.config.json` are stale and must not be reused.

## 15 October — Ambassador/Airdrop compact-layout QA iteration

- iOS Ambassador now displays the Android cabinet's core stat tiles, claimable/claimed/pending rewards, and expandable identity, overview, buyers, purchases and pending sections when a profile exists. Registration and signing actions remain unavailable on iOS. The empty-profile state was visually checked on an iPhone simulator; a populated real cabinet has **not** been visually verified.
- iOS Airdrop now distinguishes Telegram available, verification, live session, queued, legacy-used and received states from the same read sources as Android. Social cards render while reads are pending instead of leaving a blank page; the UI does not invent a claim result when the read fails. A 20-second read timeout was added so the page does not wait indefinitely for either source.
- Android Airdrop status pills and metadata cards can shrink/wrap on narrow widths; Ambassador reward and action grids wrap instead of compressing below readable widths. The local Android debug APK built and installed on a Pixel_8 emulator configured to 360x640 at 320 dpi. Its window was not exposed to the available visual-control tool, so an actual Android screenshot/visual pass remains outstanding.
- iOS simulator build succeeded. The Airdrop screen and first scroll were visually inspected; the final bottom-card/footer clearance could not be confirmed because simulator input became unavailable on subsequent scroll attempts. Real-device QA remains outstanding.
- TypeScript, targeted ESLint, 167 mobile unit tests, and Hermes exports for iOS and Android passed for this iteration. These checks do not replace device QA. Do not submit new binaries to either store until visual QA, metadata and screenshots are complete.
- QA source commit `337f816`. New EAS production-profile binaries were queued (not store-submitted): Android 1.0.10 versionCode 24 build `45124c5f-8788-41b5-82fa-139c7ae9745b`; iOS 1.0.10 buildNumber 26 build `798300ba-4ab2-482f-b00c-9c4a0317ec43`. EAS accepted the upload and reported cached signing credentials. The binaries are not yet confirmed finished at this entry.
- iOS 1.0.10 (26) subsequently reached `FINISHED`; IPA: https://expo.dev/artifacts/eas/NUmCtQc7QLmH-2yVgXiUktM_Z-953t46BXkh69G4BPw.ipa (HTTP 200 verified). Android (24) remained `IN_PROGRESS` at this check.
- Android 1.0.10 (24) subsequently reached `FINISHED`; AAB: https://expo.dev/artifacts/eas/4t9L5iOvxxSHQhS13oa0oVbsES45pvC7YTEgI34nq4A.aab (HTTP 200 verified). Both are QA binaries from source commit `337f816`, **not store submissions**. Android visual QA at 360x640 and iOS populated Ambassador cabinet / full bottom-card clearance remain unverified; store metadata and screenshots are stale.
