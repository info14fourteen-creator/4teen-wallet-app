# TronixRent energy integration checklist

Each item gets a 15 minute audit/implementation slot. Goal: any flow that can burn TRX for Energy must either use the wallet rental UI backed by TronixRent, or a backend TronixRent auto-rent gate before sending the transaction.

| Slot | Flow | Energy consumer | Status |
| --- | --- | --- | --- |
| 1 | TRC20 send | `apps/mobile/src/services/wallet/send.ts` via `apps/mobile/app/send-confirm.tsx` | Covered by `getEnergyResaleQuote` / `rentEnergyForPurpose`, now backed by TronixRent |
| 2 | Direct buy | `buyTokens()` in `apps/mobile/src/services/direct-buy.ts` via `apps/mobile/app/buy-confirm.tsx` | Covered by `direct_buy` rental purpose, now backed by TronixRent |
| 3 | Swap | `approve()` and swap `.send()` in `apps/mobile/src/services/swap/sunio.ts` via `apps/mobile/app/swap-confirm.tsx` | Covered by `swap` rental purpose, now backed by TronixRent |
| 4 | Ambassador registration | `registerAsAmbassador()` in `apps/mobile/src/services/ambassador.ts` via `apps/mobile/app/ambassador-confirm.tsx` | Covered by `ambassador_registration` rental purpose, now backed by TronixRent |
| 5 | Ambassador withdrawal | `withdrawRewards()` in `apps/mobile/src/services/ambassador.ts` via `apps/mobile/app/ambassador-withdraw-confirm.tsx` | Covered by `ambassador_withdraw` rental purpose, now backed by TronixRent |
| 6 | Liquidity execution | `bootstrapAndExecute()` in `apps/mobile/src/services/liquidity-controller.ts` via `apps/mobile/app/liquidity-confirm.tsx` | Covered by `liquidity_execute` rental purpose, now backed by TronixRent |
| 7 | Telegram airdrop backend | `airdrop()` in `apps/api/src/services/airdrop/telegramBot.js` | Switched from direct GasStation rental to backend TronixRent auto-rent |
| 8 | Ambassador allocation backend | `recordVerifiedPurchase()` in `apps/api/src/services/ambassador/controller.js` through `resourceGate.js` | Switched from direct GasStation rental to backend TronixRent auto-rent |
| 9 | Transfer Pass sponsorship | sponsored transfer resources in `apps/api/src/services/transferPass/service.js` | Quote and fulfillment switched to TronixRent |

Automation: `tronixrent-energy-integration-checklist`, heartbeat every 15 minutes.

Heartbeat follow-up audit: no additional active on-chain Energy flows were found outside the listed mobile rental UI or backend TronixRent auto-rent gates. Stale ops/UI references to GasStation were renamed where they would confuse the new TronixRent path.
