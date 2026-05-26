# Junoswap Architecture

---

## System Overview

Junoswap is a multi-chain DeFi app — swap tokens across 7 DEXs, manage concentrated liquidity positions, and earn rewards from LP mining, all on 6 EVM chains.

```
User Interface
  Pages: Landing · Swap · Earn · Bridge · Launchpad
  Shared: Wallet · Settings · Navigation
  → app/ · components/
    ↓
Business Logic
  Multi-DEX Aggregation · LP Management
  Quote Comparison · Mining Rewards
  → hooks/ · store/ · services/
    ↓
Blockchain Layer
  wagmi + viem · 6 EVM Chains
  Contract ABIs · RPC Providers
  → lib/abis/ · lib/wagmi.ts · lib/dex-config.ts
```

---

## Web3 Integration

### Supported Chains

| Chain | Chain ID | RPC | Explorer | Status |
|-------|----------|-----|----------|--------|
| KUB Testnet | 25925 | rpc-testnet.bitkubchain.io | testnet.bkcscan.com | ✅ Active |
| KUB Mainnet | 96 | rpc.bitkubchain.io | bkcscan.com | ✅ Active |
| JBC Chain | 8899 | rpc-l1.jibchain.net | exp-l1.jibchain.net | ✅ Active |
| Base | 8453 | mainnet.base.org | basescan.org | ✅ Active |
| Worldchain | 480 | worldchain-mainnet.g.alchemy.com/public | worldchain-mainnet.explorer.alchemy.com | ✅ Active |
| BNB Chain | 56 | 56.rpc.thirdweb.com | bscscan.com | ✅ Active |

**Config**: `lib/wagmi.ts`

### DEX Configuration

| DEX | Priority | Protocol | Chains | Status |
|-----|----------|----------|--------|--------|
| JunoSwap | 1 | Uniswap V3 | KUB Testnet, JBC, KUB Mainnet | ✅ Active |
| Uniswap | 1 | Uniswap V3 | Worldchain, Base | ✅ Active |
| PancakeSwap | 1 | PancakeSwap V3 | BSC | ✅ Active |
| Jibswap | 2 | Uniswap V2 | JBC | ✅ Active |
| UdonSwap | 3 | Uniswap V2 | KUB Mainnet | ✅ Active |
| Ponder Finance | 4 | Uniswap V2 | KUB Mainnet | ✅ Active |
| Diamon Finance | 5 | Uniswap V2 | KUB Mainnet | ✅ Active |

**Config**: `lib/dex-config.ts`

**KUB Testnet (JunoSwap V3)**:
- Factory: `0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b`
- Quoter: `0x3F64C4Dfd224a102A4d705193a7c40899Cf21fFe`
- Router: `0x3C5514335dc4E2B0D9e1cc98ddE219c50173c5Be`
- Fee Tiers: 100, 500, 3000, 10000

**JBC Chain**:
- JunoSwap (V3): Factory `0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7`, Quoter `0x5ad32c64A2aEd381299061F32465A22B1f7A2EE2`, Router `0x2174b3346CCEdBB4Faaff5d8088ff60B74909A9d`
- Jibswap (V2): Factory `0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499`, Router `0x766F8C9321704DC228D43271AF9b7aAB0E529D38`

**KUB Mainnet**:
- JunoSwap (V3): Factory `0x090C6E5fF29251B1Ef9EC31605Bdd13351eA316C`, Quoter `0xCB0c6E78519f6B4c1b9623e602E831dEf0f5ff7f`, Router `0x3F7582E36843FF79F173c7DC19f517832496f2D8`
- UdonSwap (V2): Factory `0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1`, Router `0x7aA32A818cD3a6BcdF827f6a411B7adFF56e7A4A`
- Ponder Finance (V2): Factory `0x20B17e92Dd1866eC6747ACaA38fe1f7075e4B359E`, Router `0xD19C5cebFa9A8919Cc3db2F19163089feBd9604E`
- Diamon Finance (V2): Factory `0x6E906Dc4749642a456907deCB323A0065dC6F26E`, Router `0xAb30a29168D792c5e6a54E4bcF1Aec926a3b20FA`

**Worldchain**:
- Uniswap (V3): Factory `0x7a5028BDa40e7B173C278C5342087826455ea25a`, Quoter `0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c`, Router `0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6`

**Base**:
- Uniswap (V3): Factory `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`, Quoter `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`, Router `0x2626664c2603336E57B271c5C0b26F421741e481`

**BSC (BNB Chain)**:
- PancakeSwap (V3): Factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`, Quoter `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`, Router `0x1b81D678ffb9C0263b24A97847620C99d213eB14`
- Fee Tiers: 100, 500, 2500, 10000 (NOTE: PancakeSwap uses 0.25% (2500) instead of Uniswap's 0.3% (3000))

---

## Swap Feature Architecture

### Multi-DEX System

```
User inputs amount
  └─> Debounced (500ms)
  └─> useMultiDexQuotes: Fetch all DEXs in parallel
      ├─> V3: Direct + Multi-hop routes
      └─> V2: Direct + Multi-hop routes
  └─> Compare outputs, select best
  └─> DexSelectCard: Show all options
  └─> User clicks Swap
      └─> Check allowance → Approve if needed
      └─> Build transaction (V2 or V3)
      └─> Simulate → User confirms → Execute
```

### Routing Logic

**Direct Route**: Token A → Token B (single pool)
**Multi-Hop**: Token A → Intermediate → Token B (better if 0.5%+ improvement)

**Services**: `services/dex/uniswap-v3.ts`, `services/dex/uniswap-v2.ts`
**Hooks**: `hooks/useSwapRouting.ts`, `hooks/useMultiDexQuotes.ts`

### Features

- Multi-DEX quotes with price comparison across 7 DEXs
- Auto-select best DEX (optional)
- Multi-hop routing for better rates
- Slippage protection (0.1%, 0.5%, 1%, custom)
- Transaction deadline settings
- Wrap/unwrap native tokens (KUB↔KKUB, BNB↔WBNB, JBC↔WJBC, ETH↔WETH)
- Transaction simulation before execution
- Shareable swap links (URL parameter sync)
- Batch RPC calls for efficient balance fetching
- Price comparison UI with percentage difference display
- Special token handling (e.g., KUSDT non-standard allowance)
- Multi-protocol support (V2 + V3 simultaneously)

**Execution Hooks**: `hooks/useUniV3SwapExecution.ts`, `hooks/useUniV2SwapExecution.ts`

### Multi-DEX Quote Aggregation

```
User inputs amount
  └─> Debounced (500ms)
  └─> useMultiDexQuotes: Fetch ALL DEXs in parallel
      ├─> JunoSwap V3: Direct + Multi-hop routes
      ├─> Jibswap V2: Direct + Multi-hop routes
      ├─> UdonSwap V2: Direct + Multi-hop routes
      ├─> Ponder Finance V2: Direct + Multi-hop routes
      ├─> Diamon Finance V2: Direct + Multi-hop routes
      ├─> Uniswap V3: Direct + Multi-hop routes
      └─> PancakeSwap V3: Direct + Multi-hop routes
  └─> Compare outputs, calculate % difference
  └─> Auto-select best price (if enabled)
  └─> DexSelectCard: Show all options with comparison
  └─> User clicks Swap → Execute with selected DEX
```

**Priority Order**: JunoSwap (1) → Uniswap (1) → PancakeSwap (1) → Jibswap (2) → UdonSwap (3) → Ponder Finance (4) → Diamon Finance (5)

**Config**: `lib/dex-config.ts` - Priority-based DEX registry

---

## Earn Feature Architecture

### LP Position Management

```
User navigates to /earn
  └─> Tab 1: Pools - Browse available liquidity pools
  └─> Tab 2: My Positions - View owned LP positions
  └─> User clicks "Add Liquidity"
      └─> Select pool, enter amounts, set price range (V3)
      └─> Approve tokens → Create position
  └─> User clicks position → View details
      └─> Collect fees, Add/Remove liquidity, View P&L
```

**Components**: `components/positions/`
**Hooks**: `hooks/usePositions.ts`, `hooks/usePools.ts`

### LP Mining (Stake to Earn)

```
User navigates to /earn → Mining tab
  └─> MiningPools: List available incentives per chain
  └─> User clicks "Stake" on pool
      └─> StakeDialog: Select eligible LP position
      └─> Two-step approval:
          1. Approve NFT position (if needed)
          2. Stake to incentive program
      └─> StakedPositions: View staked positions + pending rewards
  └─> User clicks "Unstake"
      └─> UnstakeDialog: Shows pending rewards
      └─> Unstake + Claim + Withdraw in one transaction
```

**Components**: `components/mining/`
**Hooks**: `hooks/useIncentives.ts`, `hooks/useStakedPositions.ts`, `hooks/useStaking.ts`, `hooks/useRewards.ts`

### Features

- Create LP positions with concentrated liquidity (V3)
- Add/remove liquidity from existing positions
- Collect trading fees from LP positions
- Real-time P&L tracking for positions
- Stake LP positions to earn token rewards
- Real-time reward calculation and tracking
- Multi-chain incentive programs
- Automatic reward claiming on unstake

**Services**: `services/mining/incentives.ts`, `services/mining/staking.ts`, `services/mining/rewards.ts`
**Store**: `store/earn-store.ts`

---

## Bridge Feature Architecture

### LI.FI Integration

```
User selects chains + tokens + amount
  └─> Debounced (500ms)
  └─> useBridgeQuote: fetchBridgeRoutes (RECOMMENDED order)
      └─> Returns ranked routes from LI.FI aggregators
  └─> Display best route with fees, gas, and estimated time
  └─> User clicks Bridge
      └─> Check allowance → Approve if needed
      └─> executeRoute via LI.FI SDK
      └─> BridgeStatus: Poll getStatus every 10s
          ├─> Source phase (tx submitted on fromChain)
          ├─> Bridging phase (cross-chain relay)
          └─> Destination phase (funds received on toChain)
```

**Provider**: LI.FI SDK v3.16.3
**Supported Chains**: BNB Chain (56), Base (8453), Worldchain (480)
**Integrator Fee**: 3% (requires LI.FI whitelisting)
**Default Slippage**: 3% (configurable)

**Config**: `lib/lifi.ts`
**Services**: `services/bridge/lifi.ts`

### Route Fetching

- Uses `fetchBridgeRoutes` (getRoutes API) with `order: RECOMMENDED` for best-route selection
- AbortController cancels stale requests when inputs change
- Extracts fee breakdown, gas cost (USD), and estimated execution duration from route response
- Quote automatically refetches when chain, token, amount, or slippage changes

**Hook**: `hooks/useBridgeQuote.ts`

### Bridge Execution

- Calls `executeRoute` from LI.FI SDK — SDK handles full tx lifecycle via registered EVM provider
- Status polling via `getStatus` every 10 seconds with 3-phase tracking:
  - **Source**: transaction confirmed on origin chain
  - **Bridging**: cross-chain relay in progress
  - **Destination**: funds received on target chain
- Toast notifications on success/failure
- Unsupported chains show EmptyState with chain-switch prompt

**Hook**: `hooks/useBridgeExecution.ts`
**Component**: `components/bridge/bridge-status.tsx`

### Features

- Cross-chain token transfers across BSC, Base, and Worldchain
- Automatic best-route selection via LI.FI aggregation
- Fee breakdown with gas cost and integrator fee display
- Estimated execution duration per route
- Configurable slippage protection
- 3-phase real-time status tracking with explorer links
- Direction swap (flip from/to chains and tokens)
- Unsupported chain detection with switch prompt

**Page**: `app/bridge/page.tsx`
**Store**: `store/bridge-store.ts`

---

## Launchpad Feature Architecture

### Bonding Curve System

```
User creates token (name, symbol, logo, description, social links)
  └─> Pay createFee (0.1 native) + optional initialNative
  └─> ERC20Token deployed with 1B tokens (INITIALTOKEN)
  └─> Reserves seeded in PumpReserve mapping
  └─> Creation event emitted

User buys token
  └─> Send native (payable)
  └─> Deduct pumpFee (1% / 100 bps)
  └─> Constant-product AMM: getAmountOut(afterFee, virtualAmount + nativeReserve, tokenReserve)
  └─> Tokens transferred to buyer
  └─> Swap(isBuy=true) event emitted

User sells token
  └─> ERC20 approval required
  └─> Deduct pumpFee (1%) from token input
  └─> Constant-product AMM: getAmountOut(afterFee, tokenReserve, virtualAmount + nativeReserve)
  └─> Native transferred to seller
  └─> Swap(isBuy=false) event emitted

Graduation (automatic when threshold reached)
  └─> Any user calls graduate() when tokenReserve/nativeReserve <= INITIALTOKEN/graduationAmount
  └─> Creates Uniswap V3 pool (fee tier 10000 = 1%)
  └─> Mints full-range LP position (tickLower=-887200, tickUpper=887200)
  └─> LP NFT sent to burn address (0xdead)
  └─> Reserves deleted from bonding curve
  └─> Token now trades on JunoSwap V3
```

### Contract Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Contract | `0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9` | PumpCoreNative on KUB Testnet (25925) |
| virtualAmount | 3,400 native | Virtual reserve for bonding curve math |
| graduationAmount | 4,000 native | Native reserve threshold for graduation |
| createFee | 0.1 native | Fee paid to feeCollector on token creation |
| pumpFee | 100 (1%) | Basis points fee on buy/sell |
| INITIALTOKEN | 1,000,000,000 | Token supply at creation (18 decimals) |
| V3 Fee Tier | 10,000 (1%) | Pool fee tier on graduation |
| LP Recipient | `0xdead` | Burn address for graduated LP NFT |

**Contract**: `contracts/src/PumpCoreNative.sol` (Solidity 0.8.19)
**ABI**: `lib/abis/pump-core-native.ts`

### Token Discovery

```
Token list built from on-chain Creation events
  └─> useTokenList: fetchCreationLogs via getLogs (Creation event)
  └─> TokenList component renders cards
  └─> TokenCard with graduation progress bar
  └─> Click-through to /launchpad/token/[address]
```

### Chart System

```
Swap events aggregated into candlesticks
  └─> useTokenSwapEvents: fetch Swap events via getLogs
  └─> services/chart.ts: aggregateCandlesticks(events, timeframe)
  └─> Supports: 1m, 5m, 15m, 1h, 4h, 1d timeframes
  └─> Modes: price (native/token) and mcap (price * 1B)
  └─> token-chart.tsx: lightweight-charts CandlestickSeries
  └─> token-chart-wrapper.tsx: timeframe + mode selector
```

### IPFS Image Upload

```
User selects logo file
  └─> logo-upload.tsx: file input with MIME validation
  └─> Server action: app/actions/upload-to-pinata.ts
  └─> MIME check: PNG, JPG, GIF, SVG, WebP
  └─> Size limit: 1MB
  └─> Upload to Pinata v3 API (PINATA_JWT env var)
  └─> Returns IPFS gateway URL (gateway.pinata.cloud/ipfs/{cid})
```

### Features

- Token creation with metadata (name, symbol, logo, description, social links)
- IPFS logo upload via Pinata (server action, MIME + size validation)
- Bonding curve buy/sell with constant-product AMM (1% fee)
- Client-side price estimation with slippage protection
- Graduation progress tracking (nativeReserve / graduationAmount)
- Real-time candlestick chart (lightweight-charts, 6 timeframes, price/mcap modes)
- Token discovery via on-chain Creation events
- Token detail page with trading terminal, chart, stats, and recent trades
- Currently KUB Testnet only, with chain-not-supported EmptyState for other networks

**Hooks**: `useCreateToken`, `useBondingCurveBuy`, `useBondingCurveSell`, `useTokenPrice`, `useTokenPriceHistory`, `useTokenReserves`, `useTokenSwapEvents`, `useTokenList`
**Services**: `services/launchpad.ts`, `services/chart.ts`
**Store**: `store/launchpad-store.ts`
**Types**: `types/launchpad.ts`, `types/chart.ts`
**Server Action**: `app/actions/upload-to-pinata.ts`
