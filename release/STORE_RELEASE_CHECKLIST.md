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
- [x] `pnpm --dir apps/api lint`
- [x] `cd apps/mobile && npx tsc --noEmit`
- [x] `npx expo-doctor`
- [x] `npx expo export --platform ios`
- [x] `npx expo export --platform android`
- [x] Fix Android native install-referrer build path for current Expo Modules core

## Still Needed Before Store Submission

- [x] Publish privacy policy page and final URL
- [x] Publish support page or final support URL
- [ ] Decide final store subtitle / short description wording
- [ ] Capture fresh App Store screenshots
- [ ] Capture fresh Google Play screenshots
- [x] Prepare reviewer notes for App Store / Play review
- [x] Prepare baseline screenshot captions
- [x] Prepare exact store field pack for App Store Connect / Google Play
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

## Build tracking

- Android preview currently re-running from the fixed native-referrer path:
  - `e5af1822-de4b-4a4b-82c4-4740d158451a`
- Android production currently re-running from the fixed native-referrer path:
  - `3f8c3adb-da90-40bf-94d4-cf775aa9be78`
- iOS remains blocked only by missing Apple Developer Program team access on the current Apple account

## Helpful release files

- `release/STORE_METADATA.md`
- `release/STORE_FIELD_PACK.md`
- `release/APP_REVIEW_NOTES.md`
- `release/SCREENSHOT_PLAN.md`
- `release/SCREENSHOT_CAPTIONS.md`
- `release/RELEASE_READINESS_STATUS.md`
