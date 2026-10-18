# Built for Pharos Season of AI

# Gas Optimizer for Pharos

A browser dashboard for Pharos gas readings, historical block samples, and explicitly approved wallet transaction submissions. It makes estimates and receipt-backed fees distinguishable; it does not guarantee inclusion, confirmation, a deadline, or savings.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Production and quality commands:

```sh
npm run build
npm run lint
npm test
```

## Network behavior

Network configuration is centralized in `src/App.jsx`:

| Network | Chain ID | RPC | Native symbol |
| --- | ---: | --- | --- |
| Atlantic Testnet | 688689 | `https://atlantic.dplabs-internal.com` | PHRS |
| Pacific Mainnet | 1672 | `https://rpc.pharos.xyz` | PROS |

Live readings, block samples, gas estimates, receipt polling, and raw transaction submission use direct JSON-RPC to the selected network. Historical samples come from block transaction gas prices where available, otherwise the block base fee is shown as a distinct sample type. `eth_gasPrice` is the current RPC gas-price reading; it is not a block base fee or a transaction receipt's effective gas price.

The app checks the hosted Pharos MCP tool catalog. It looks for the published `get_gas_price` and `estimate_gas` schemas, but this dashboard does not call those tools; its data path remains direct RPC. No Skill Engine call is implemented. If the catalog check fails, the status shows the RPC fallback and reason. The hosted Pharos MCP currently documents read-only gas tools, and its raw-send tool is disabled; this app's raw transaction path sends directly to the selected RPC.

The transaction presets are Atlantic testnet examples. They are blocked on Pacific Mainnet unless you edit a transaction field to make a custom transaction. Verify addresses and contract behavior before submitting. RPC estimates do not guarantee transaction success.

## Transaction lifecycle and limits

- Scheduling records a job and attempts submission when the live RPC gas reading reaches the target or the deadline arrives. A deadline means an attempt is triggered; it does not guarantee a wallet is available, the RPC accepts the transaction, or the chain confirms it.
- Unsigned transactions require an injected wallet, explicit wallet approval, and a chain ID matching the selected network.
- Raw signed transaction bytes are only checked for hex encoding. The UI asks before broadcasting them. Their decoded destination, value, nonce, chain ID, and fee cap are not inspected.
- A successful wallet/RPC response is recorded as `submitted`, not `confirmed`. Receipt status, gas used, and effective gas price update the record when a receipt arrives. A transaction still pending after the bounded polling window remains `submitted`.
- Receipt-based realized savings compare receipt gas used at the recorded request-time `eth_gasPrice` against actual receipt `effectiveGasPrice`. This is a retrospective comparison, not a guarantee of savings versus an alternative transaction that was never sent.
- Jobs and reports live in browser memory and are lost on reload. The scheduler requires this page to remain open.

## Tests

`npm test` runs the Node test suite for unit conversions, fee arithmetic, input validation, gas history summaries, fee-history indexing, MCP catalog schemas, scheduler triggers, and receipt-based savings arithmetic. Wallet approval flows and live RPC/MCP endpoint behavior need a separate integration environment and are not covered by these unit tests.

Built for the Pharos Season of AI / Pharos AI Agent Arena.
