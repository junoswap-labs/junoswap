import type { Abi, Address, PublicClient } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI, getBondingCurveDeployment } from '@coshi190/juno-moneta-sdk'

export interface CurveState {
    createFee: bigint
    initialNative: bigint
    virtualAmount: bigint
    graduationAmount: bigint
    nativeReserve: bigint
    tokenReserve: bigint
}

export interface CurveStateParams {
    chainId: number
    token?: Address
}

const CURVE_GLOBALS = ['createFee', 'initialNative', 'virtualAmount', 'graduationAmount'] as const

interface CurveCall {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
}

// kubTestnet has no multicall3 in its chain definition, so viem's multicall throws there.
// Fall back to one read per call rather than losing the whole curve state.
async function batchRead(
    client: PublicClient,
    calls: readonly CurveCall[]
): Promise<(unknown | undefined)[]> {
    try {
        const results = await client.multicall({ contracts: calls, allowFailure: true })
        return results.map((r) => (r.status === 'success' ? r.result : undefined))
    } catch {
        const settled = await Promise.allSettled(calls.map((call) => client.readContract(call)))
        return settled.map((o) => (o.status === 'fulfilled' ? o.value : undefined))
    }
}

export async function getCurveState(
    client: PublicClient,
    params: CurveStateParams
): Promise<CurveState | null> {
    const deployment = getBondingCurveDeployment(params.chainId)
    if (!deployment) return null

    const abi = BONDING_CURVE_JUNOSWAP_ABI as Abi
    const contracts: CurveCall[] = CURVE_GLOBALS.map((functionName) => ({
        address: deployment.address,
        abi,
        functionName,
        args: [],
    }))
    if (params.token) {
        contracts.push({
            address: deployment.address,
            abi,
            functionName: 'pumpReserve',
            args: [params.token],
        })
    }

    const results = await batchRead(client, contracts)
    const valueAt = (index: number): unknown => results[index]

    const [createFee, initialNative, virtualAmount, graduationAmount] = CURVE_GLOBALS.map(
        (_, index) => valueAt(index) as bigint | undefined
    )
    if (
        createFee === undefined ||
        initialNative === undefined ||
        virtualAmount === undefined ||
        graduationAmount === undefined
    ) {
        return null
    }

    const reserves = params.token
        ? (valueAt(CURVE_GLOBALS.length) as readonly [bigint, bigint] | undefined)
        : undefined
    const [nativeReserve, tokenReserve] = reserves ?? [0n, 0n]

    return {
        createFee,
        initialNative,
        virtualAmount,
        graduationAmount,
        nativeReserve,
        tokenReserve,
    }
}
