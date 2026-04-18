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
