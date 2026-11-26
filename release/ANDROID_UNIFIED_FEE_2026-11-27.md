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

There is no physical Android phone available. Emulator visual checks and final
APK status are recorded separately when completed. Never uninstall an existing
wallet to work around a signing mismatch. No real financial tests or background
provider funding are authorized for this candidate.
