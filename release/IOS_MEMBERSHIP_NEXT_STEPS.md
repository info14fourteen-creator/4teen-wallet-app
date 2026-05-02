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
