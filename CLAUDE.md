# CLAUDE.md

## Project

Junoswap — multi-chain DeFi aggregator (swap, bridge, LP, launchpad). Live at junoswap.trade.

## Directory map

app/            Next.js App Router pages + server actions
components/     React components by feature (swap/, bridge/, positions/, mining/, launchpad/, web3/, ui/)
hooks/          Custom hooks — all blockchain interactions live here
services/       Pure business logic (no React): dex/, liquidity/, mining/, bridge/
store/          Zustand stores (swap, bridge, earn, launchpad)
lib/            Config & utilities: wagmi.ts, dex-config.ts, routing-config.ts, abis/, token lists
types/          TypeScript type definitions by domain
contracts/      Foundry Solidity project (PumpCoreNative bonding curve) — git submodule

## Key conventions

- Runtime: **bun only** — never use npm, yarn, or pnpm. Lockfile is `bun.lock`.
- Tests: test business logic, not framework behavior — skip tautologies, passthroughs, exact duplicates, and trivial defaults.
- Comments: comment only genuinely complex or non-obvious code — the *why*, gotchas, workarounds, magic-value/address decoders, sign conventions, contract-ABI correspondences, and math derivations. Do NOT add section-divider banners (`// ==== X ====`, `// ── X ──`), one-word grouping labels (`// Settings`, `// Actions`), JSDoc that restates the function/type name, or inline narration of self-evident code.

## Notes

- **kub mainnet/testnet RPC** (`rpc.bitkubchain.io`) is NOT a full archive node. Historical `eth_call` reads fail with "missing trie node".
