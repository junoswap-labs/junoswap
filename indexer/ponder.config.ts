import { createConfig } from 'ponder'
import { PUMP_CORE_NATIVE_ABI } from './abis/pump-core-native'

export default createConfig({
    chains: {
        kubTestnet: {
            id: 25925,
            rpc: process.env.PONDER_RPC_URL_25925 ?? 'https://rpc-testnet.bitkubchain.io',
        },
    },
    contracts: {
        PumpCoreNative: {
            abi: PUMP_CORE_NATIVE_ABI,
            chain: 'kubTestnet',
            address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
            startBlock: 29065000,
        },
    },
})
