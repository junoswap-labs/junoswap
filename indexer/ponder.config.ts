import { createConfig } from 'ponder'
import {
    BONDING_CURVE_JUNOSWAP_ABI,
    BONDING_CURVE_JUNOSWAP_ADDRESS,
} from './abis/bonding-curve-junoswap'
import { ERC20_ABI } from './abis/erc20'
import { UNISWAP_V3_FACTORY_ABI } from './abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from './abis/uniswap-v3-pool'
import { UNISWAP_V2_FACTORY_ABI } from './abis/uniswap-v2-factory'
import { UNISWAP_V2_PAIR_ABI } from './abis/uniswap-v2-pair'
import externalPools from './external-pools.json'

// Existing external pools (created before tracking launched), generated from each
// factory's historical PairCreated/PoolCreated logs (scripts regenerate this). Each
// entry carries the pool address + token0/token1 (+ fee/tickSpacing for kublerx) so
// the swap handlers can seed pool metadata without a historical PairCreated scan.
// We only watch Swap on these addresses from the rollout block, so no historical
// Swap backfill and no giant log scan.
const seed = (dex: keyof typeof externalPools) =>
    (externalPools[dex] as Array<{ pair?: string; pool?: string }>).map(
        (p) => (p.pair ?? p.pool) as `0x${string}`
    )

// The Creation event carries the new token's address (non-indexed). Ponder's
// factory discovery reads non-indexed params via byte offset, so this still
// works despite tokenAddr not being an indexed topic.
const CREATION_EVENT = BONDING_CURVE_JUNOSWAP_ABI.find(
    (e) => e.type === 'event' && e.name === 'Creation'
)!

const PAIR_CREATED_EVENT = UNISWAP_V2_FACTORY_ABI[0]
const V3_POOL_CREATED_EVENT = UNISWAP_V3_FACTORY_ABI[0]

// External-DEX (non-Junoswap) contracts all start at the rollout block (~24h before
// launch, captured 2026-06-18). Pre-existing pools' metadata is seeded from
// external-pools.json (lazy-inserted in the swap handlers), so we do NOT scan
// historical PairCreated/PoolCreated — avoiding the 30M-block backfill that stalled
// PGlite. The Factory contracts only catch pools created after rollout; the Seeded
// Swap contracts watch the known pool addresses; both start here. ~24h of margin
// ensures launch-day swaps (e.g. bitkub block 32711702) are in range.
const BITKUB_SWAP_START = 32685221
const JBC_SWAP_START = 8073843

export default createConfig({
    chains: {
        kubTestnet: {
            id: 25925,
            rpc: process.env.PONDER_RPC_URL_25925 ?? 'https://rpc-testnet.bitkubchain.io',
        },
        bitkub: {
            id: 96,
            rpc: process.env.PONDER_RPC_URL_96 ?? 'https://rpc.bitkubchain.io',
        },
        jbc: {
            id: 8899,
            rpc: process.env.PONDER_RPC_URL_8899 ?? 'https://rpc-l1.jibchain.net',
        },
    },
    contracts: {
        BondingCurveJunoswap: {
            abi: BONDING_CURVE_JUNOSWAP_ABI,
            chain: 'kubTestnet',
            address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
            startBlock: 29065000,
        },
        // Launch tokens are created dynamically by BondingCurveJunoswap. Each Creation
        // event registers the new token contract so Ponder indexes its Transfer
        // events (used by the Portfolio activity feed).
        LaunchToken: {
            abi: ERC20_ABI,
            chain: 'kubTestnet',
            factory: {
                address: BONDING_CURVE_JUNOSWAP_ADDRESS,
                event: CREATION_EVENT,
                parameter: 'tokenAddr',
            },
            startBlock: 29065000,
        },
        // kubTestnet V3
        V3Factory: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'kubTestnet',
            address: '0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b',
            startBlock: 23900000,
        },
        V3Pool: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'kubTestnet',
            factory: {
                address: '0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b',
                event: UNISWAP_V3_FACTORY_ABI[0],
                parameter: 'pool',
            },
            startBlock: 23900000,
        },
        // bitkub mainnet V3
        V3FactoryBitkub: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'bitkub',
            address: '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C',
            startBlock: 25000000,
        },
        V3PoolBitkub: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            factory: {
                address: '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C',
                event: UNISWAP_V3_FACTORY_ABI[0],
                parameter: 'pool',
            },
            startBlock: 25000000,
        },
        // JBC V3
        V3FactoryJbc: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'jbc',
            address: '0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7',
            startBlock: 2900000,
        },
        V3PoolJbc: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'jbc',
            factory: {
                address: '0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7',
                event: UNISWAP_V3_FACTORY_ABI[0],
                parameter: 'pool',
            },
            startBlock: 2900000,
        },

        // ---- External (non-Junoswap) DEXes — calldata referrer tracking only ----
        // All start at the rollout block. The *Seeded contracts watch Swap on the
        // already-existing pools listed in external-pools.json; the factory-discovered
        // *Pair/*Pool contracts catch pools created after rollout; the Factory records
        // metadata for those new pools. Metadata for pre-existing pools is lazy-seeded
        // from external-pools.json inside the swap handlers (no historical scan).
        //
        // jibswap V2 (JBC)
        JibswapFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'jbc',
            address: '0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499',
            startBlock: JBC_SWAP_START,
        },
        JibswapPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'jbc',
            address: seed('jibswap'),
            startBlock: JBC_SWAP_START,
        },
        JibswapPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'jbc',
            factory: {
                address: '0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499',
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            },
            startBlock: JBC_SWAP_START,
        },
        // udonswap V2 (bitkub)
        UdonswapFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1',
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('udonswap'),
            startBlock: BITKUB_SWAP_START,
        },
        UdonswapPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            factory: {
                address: '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1',
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            },
            startBlock: BITKUB_SWAP_START,
        },
        // ponder V2 (bitkub)
        PonderFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: '0x20B17e92Dd1866eC647ACaA38fe1f7075e4B359E',
            startBlock: BITKUB_SWAP_START,
        },
        PonderPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('ponder'),
            startBlock: BITKUB_SWAP_START,
        },
        PonderPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            factory: {
                address: '0x20B17e92Dd1866eC647ACaA38fe1f7075e4B359E',
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            },
            startBlock: BITKUB_SWAP_START,
        },
        // diamon V2 (bitkub)
        DiamonFactory: {
            abi: UNISWAP_V2_FACTORY_ABI,
            chain: 'bitkub',
            address: '0x6E906Dc4749642a456907deCB323A0065dC6F26E',
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPairSeeded: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            address: seed('diamon'),
            startBlock: BITKUB_SWAP_START,
        },
        DiamonPair: {
            abi: UNISWAP_V2_PAIR_ABI,
            chain: 'bitkub',
            factory: {
                address: '0x6E906Dc4749642a456907deCB323A0065dC6F26E',
                event: PAIR_CREATED_EVENT,
                parameter: 'pair',
            },
            startBlock: BITKUB_SWAP_START,
        },
        // kublerx V3 (bitkub)
        KublerxV3Factory: {
            abi: UNISWAP_V3_FACTORY_ABI,
            chain: 'bitkub',
            address: '0xD679d310008A2595B8d3DeB83bb93EB23F9b0942',
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3PoolSeeded: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            address: seed('kublerx'),
            startBlock: BITKUB_SWAP_START,
        },
        KublerxV3Pool: {
            abi: UNISWAP_V3_POOL_ABI,
            chain: 'bitkub',
            factory: {
                address: '0xD679d310008A2595B8d3DeB83bb93EB23F9b0942',
                event: V3_POOL_CREATED_EVENT,
                parameter: 'pool',
            },
            startBlock: BITKUB_SWAP_START,
        },
    },
})
