# App Review response draft — do not send before attaching real-device evidence

Thank you for the clarification regarding Guideline 5.1.1(v).

4TEEN is a self-custody wallet. Creating or importing a wallet creates a local
wallet record and, for signing wallets, stores key material securely on the
device. It does not create a developer-hosted login account.

In version 1.0.6 (18), we have made deletion explicit and easier to locate:

1. Open the menu in the top-left corner and select Settings.
2. Select Delete wallet and data.
3. Select the wallet to delete, or choose the separate Delete all wallets and
   wallet data option to remove all saved wallets and local wallet data.
4. Review the deletion scope and recovery-backup warning. Confirm the backup
   acknowledgement and enter the app passcode if one is configured.
5. Select Delete this wallet (or Delete all wallets and wallet data).
6. The app displays Deletion complete. Select Done to reload the app with the
   updated wallet state.

The same per-wallet deletion flow is also available from Wallet > More >
Delete this wallet and from Wallet Management after selecting a wallet.

Deletion removes the selected wallet's local key material and associated local
records, including cached history, balances and token settings. The all-wallet
option additionally removes saved contacts, drafts, preferences and the local
passcode/biometric settings. Confirmation is shown only after storage erasure
has been verified. Deletion requires no support request or external website.

Blockchain addresses and on-chain transactions are immutable and cannot be
erased from the blockchain. Deletion does not transfer, burn or otherwise move
funds. We clearly warn users to preserve their recovery backup before deleting
local signing keys.

## Evidence still required

Before posting this response, record the exact new build running on a physical
iPhone, using only a new empty disposable signing wallet. Show creation or
import/sign-in, the full navigation to deletion, the confirmation, the success
screen and the state after Done. Never show personal wallet keys, private
notifications, passcodes or unrelated user information. If the test setup
requires creating or changing an authentication credential, the user completes
that step. Never use Delete all wallets on a populated personal installation.

Attach the reviewed video to the App Review response and App Review Information
attachment, and mention the verified filename in the Notes. Do not claim that
the video is attached until the upload is visibly confirmed. Do not label
simulator QA footage as physical-device evidence.
