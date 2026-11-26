# Android unified fee candidate

Google Play Console was checked on 27 November 2026. Latest production release:
`4TEEN 1.0.10 (24)`, rollout 100%, with no unpublished changes shown.

EAS confirms the matching completed build
`45124c5f-8788-41b5-82fa-139c7ae9745b`, source
`337f8161f841485339063291c9e6a37ee8f94e73`.
The `codex/android-unified-fee` branch starts from that exact commit, not from
the older checkout or an assumed iOS baseline. Existing iOS route restrictions
in this Android branch were preserved.

The same shared fee calculation, existing confirmation-field presentation,
total ceiling, rental/burn selection and durable retry journal were ported.
Ordinary TRX transfers remain excluded. No new confirmation screens were added.

Source commit `c4c7d99` was pushed to GitHub. Offline verification: 223 source
tests passed, TypeScript and scoped ESLint passed, Android Hermes export passed.

EAS internal APK candidate: 1.0.11 (25), build
`ffcdb13c-23c0-4ef7-82c4-9160bc5375a9`, profile `device-qa` using existing remote
signing credentials. This is not a Google Play submission or publication.

The EAS build finished successfully. APK package/version read-back confirms
`me.fourteen.wallet`, 1.0.11, versionCode 25. Original APK SHA-256:
`c6c68155b867087219c8746eb6805db238161af806a0992e2893ea727b9ece43`.
Its signing certificate SHA-256 is
`d9929604944e2abb7b12e2d417ad85edfab08961cc6a75d3088c09bdc69e9524`.

There is no physical Android phone available. A separate emulator-only copy
was re-signed with the existing emulator debug certificate (SHA-256
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`),
then installed with `adb install -r`. No uninstall or data reset was performed.
The original release-signed APK was not modified. Emulator package inventory
confirms version 25 and the app launches to the existing wallet passcode gate.
Before the update the emulator had one watch-only wallet; its metadata was
captured locally, not committed. Post-unlock wallet/fee-screen verification is
still pending because the existing passcode is not available to the agent.

No real financial tests, Google Play submissions, or background provider-funding
changes were performed. Never distribute the debug-signed emulator copy or
uninstall an existing wallet to work around a signing mismatch.
