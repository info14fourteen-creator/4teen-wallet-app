# 4TEEN Mobile Development

This app should be developed with a **development build**, not plain Expo Go.

## Why Expo Go is not the main path

The project includes custom native code:

- local Expo module: `modules/install-referrer`

Because of that, Expo Go is only a partial sandbox here. It is not the reliable way to run the app on a real device.

## Correct daily workflow

### 1. Install a development build once

If you do not already have the `4TEEN` development app installed on your iPhone, build one:

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dlx eas-cli build -p ios --profile development
```

After the build finishes, install that build on the device.

Use this instead of Expo Go for this project.

### 2. Start Metro for the dev client

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dev:client:clear
```

Or without clearing cache:

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dev:client
```

### 3. Open the installed `4TEEN` dev app

Do **not** open Expo Go.

Open the installed `4TEEN` development app on the phone. It should connect to the Metro server.

## Useful scripts

```bash
pnpm start
pnpm dev:client
pnpm dev:client:clear
pnpm ios
pnpm android
```

## When QR is still needed

QR is only a fallback:

- first launch of a new dev build
- device and Mac are not discovering the local server automatically
- you started plain `expo start` instead of `expo start --dev-client`

If the dev client is installed and Metro is started with `--dev-client`, QR should not be your normal daily flow.

## If the phone does not see the server

Try:

```bash
cd /Users/stanataev/4teen-wallet-app/apps/mobile
pnpm dev:client:clear -- --tunnel
```

If that is not enough:

- make sure phone and Mac are on the same network
- make sure VPN is not interfering
- reopen the `4TEEN` dev app after Metro is running

## Production note

`Expo Go` and `development build` are only for development.

Store builds come from EAS:

```bash
pnpm dlx eas-cli build -p ios --profile production
pnpm dlx eas-cli build -p android --profile production
```
