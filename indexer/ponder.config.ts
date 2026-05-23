import { createConfig } from 'ponder'
import { PUMP_CORE_NATIVE_ABI } from './abis/pump-core-native'
import { UNISWAP_V3_FACTORY_ABI } from './abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from './abis/uniswap-v3-pool'

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
        PumpCoreNative: {
            abi: PUMP_CORE_NATIVE_ABI,
            chain: 'kubTestnet',
            address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
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
    },
})
