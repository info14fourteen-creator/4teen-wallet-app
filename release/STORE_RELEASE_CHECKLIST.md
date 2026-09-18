# 4TEEN Store Release Checklist

> Historical checklist for 1.0.5. Current 1.0.6 tracking: `release/IOS_1.0.6_RELEASE.md`. Verified build/review history: `release/IOS_RELEASE_HISTORY_2026-09-17.md`.

## Config

- [x] Set short app display name to `4TEEN`
- [x] Set iOS bundle identifier to `me.fourteen.wallet`
- [x] Set Android package to `me.fourteen.wallet`
- [x] Set app version to `1.0.5`
- [x] Enable EAS remote app versioning
- [x] Wire main app icon
- [x] Add `eas.json`
- [x] Add `.easignore`
- [x] Confirm legal operator as `"AG PLUS" LLC`
- [x] Confirm D-U-N-S Number `933906683`
- [x] Confirm publication support email `genesis@4teen.me`
- [x] Confirm publication WhatsApp / phone `+998 95 792 02 87`

## Verification

- [x] `pnpm --dir apps/mobile lint`
- [x] `pnpm --dir apps/api lint`
- [x] `cd apps/mobile && npx tsc --noEmit`
- [x] `npx expo-doctor`
- [x] `npx expo export --platform ios`
- [x] `npx expo export --platform android`
- [x] Fix Android native install-referrer build path for current Expo Modules core
- [x] Add production-safe app runtime recovery and ops error reporting

## Still Needed Before Store Submission

- [x] Publish privacy policy page and final URL
- [x] Publish support page or final support URL
- [x] Verify public legal/support pages with updated AG PLUS, D-U-N-S, D&B seal, support email, and WhatsApp details
- [x] Decide final Google Play short description wording
- [ ] Capture fresh App Store screenshots
- [x] Review and order the supplied Google Play branded screenshot set
- [x] Reject the raw Android home-screen screenshot set from upload
- [x] Fix feature graphic headline clipping and export a no-alpha 1024×500 JPEG
- [ ] Align public privacy/terms/support contact identity with the requested Play storefront email and legal-entity naming
- [x] Prepare reviewer notes for App Store / Play review
- [x] Prepare baseline screenshot captions
- [x] Prepare exact store field pack for App Store Connect / Google Play
- [x] Disable Swap, Direct Buy, token issuance, liquidity, Airdrop, Ambassador, unlock-timeline, Whitepaper, and protocol execution routes in the iOS product surface and direct routes
- [x] Remove those claims and screenshot references from the Apple submission pack
- [x] Confirm the iOS export contains redirect-only Swap routes and excludes native execution symbols (`getSwapQuotes`, `buildSwapReview`, `executeSwap`) plus the published SUN.io router address
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

## Platform feature split

- iOS: native Swap disabled globally; core footer opens the generic Browser; `/swap` and `/swap-confirm` safely return to Wallet.
- Android: native SUN.io Swap remains enabled and Google Play copy remains unchanged.
- Current Browser: no injected TRON provider and no website transaction-signing bridge.
- The iOS bundle uses no SUN.io quote route; token price presentation degrades safely instead of requesting an exchange quote.

## Build tracking

- Android preview currently re-running from the fixed native-referrer path:
  - `e5af1822-de4b-4a4b-82c4-4740d158451a`
- Android production currently re-running from the fixed native-referrer path:
  - `3f8c3adb-da90-40bf-94d4-cf775aa9be78`
- Apple Developer Program and App Store Connect access are active; build 11 is the next submission target.

## Helpful release files

- `release/STORE_METADATA.md`
- `release/GOOGLE_PLAY_STOREFRONT_FINAL.md`
- `release/STORE_FIELD_PACK.md`
- `release/APP_REVIEW_NOTES.md`
- `release/SCREENSHOT_PLAN.md`
- `release/SCREENSHOT_CAPTIONS.md`
- `release/RELEASE_READINESS_STATUS.md`
