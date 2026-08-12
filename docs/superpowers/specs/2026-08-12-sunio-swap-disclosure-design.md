# SUN.io Swap Disclosure Design

## Goal

Keep the in-wallet swap feature while making the technical and commercial roles unambiguous to users and store reviewers. 4TEEN remains a non-custodial wallet interface. SUN.io remains the independent decentralized protocol that supplies and executes the on-chain route. The developer does not claim that a label change alters the legal classification of the feature.

## Product language

- Name the feature **Swap via SUN.io** on the swap and confirmation screens.
- Describe SUN.io as an independent third-party decentralized protocol.
- State that 4TEEN does not operate SUN.io, act as the user's counterparty, or take custody of user assets.
- Avoid claims that no license is required.
- Keep the word **Swap**. Do not disguise the feature as a conversion.

## Swap screen

Add a persistent disclosure card near the page heading. It must identify SUN.io, describe 4TEEN's non-custodial interface role, and explain that the user reviews and signs the resulting blockchain transaction.

Each available route must show:

- provider;
- token path;
- protected minimum received;
- price impact;
- route or execution status;
- Smart Router contract address with a Tronscan link;
- network and resource cost information when available.

The route action is labeled **Review transaction**. It must never imply that opening the review screen executes a swap.

## Confirmation screen

The confirmation screen repeats the third-party and non-custodial disclosure. It shows the final route, protected minimum, slippage, price impact, Smart Router address, and estimated network/resource cost before authentication.

The final action is labeled **Sign transaction**. Existing passcode or biometric authentication remains the authorization gate. Transaction construction, allowance handling, resource rental, submission, and history behavior remain unchanged.

## External verification

The SUN.io Smart Router address is displayed as a shortened selectable address. A link opens the address in Tronscan. Existing transaction-result links continue to open the submitted transaction in Tronscan.

## Localization

Every new user-facing string must be translated for all currently supported application languages:

- English
- Russian
- Turkish
- Uzbek
- Arabic
- German
- Spanish
- French
- Hindi
- Italian
- Japanese
- Korean
- Dutch
- Polish
- Portuguese
- Simplified Chinese

No new disclosure may rely on an English fallback outside English.

## App Review notes

Update the review explanation to state, factually:

- 4TEEN is a self-custody wallet and transaction-preparation interface;
- SUN.io is the independent protocol used for swap routing;
- 4TEEN does not maintain an order book, match counterparties, set exchange rates, custody assets, accept deposits, or execute transactions without the user's signature;
- the user sees the route and material transaction details before signing;
- the transaction goes from the user's wallet to the published Smart Router contract.

Provide the router address and review steps. Do not make unsupported legal conclusions.

## Error handling

- If the router address or external link cannot be opened, the swap flow remains usable and shows the existing notice mechanism.
- If resource estimates are unavailable, show the existing unavailable or refresh state rather than inventing a fee.
- Existing route executability checks remain authoritative.

## Testing

Automated checks must cover the disclosure model and required route-review labels. Existing TypeScript and lint checks must pass.

Manual verification must cover:

- iPhone portrait;
- iPad portrait and landscape;
- Android phone;
- swap route selection;
- confirmation and signing gate;
- SUN.io and Tronscan links;
- at least English, Russian, Turkish, Uzbek, Arabic, and Simplified Chinese layouts, with automated dictionary coverage for all languages.

## Release scope

Ship the same disclosure behavior on iOS and Android. The change does not remove Swap or Direct Buy and does not alter the existing smart-contract execution logic.
