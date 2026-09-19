import type { Abi, Address, PublicClient } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { LAUNCHPAD_V1_1_ID } from '@/lib/launchpad-curve'

export interface CurveState {
    createFee: bigint
    initialNative: bigint
    virtualAmount: bigint
    graduationAmount: bigint
    nativeReserve: bigint
    tokenReserve: bigint
    /** The token reserve a fresh curve is seeded with. V1 seeds the full supply; V1.1 seeds a
     *  larger synthetic reserve. Null when the curve has no such getter. */
    curveReserve: bigint | null
}

export interface CurveStateParams {
    chainId: number
    token?: Address
    /** Which curve deployment to read. Defaults to the chain's primary launchpad. */
    launchpadId?: string
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
    const deployment = getBondingCurveDeployment(params.chainId, params.launchpadId)
    if (!deployment) return null

    const hasCurveReserve = params.launchpadId === LAUNCHPAD_V1_1_ID
    const abi = getAbi(hasCurveReserve ? 'bondingCurveV1_1' : 'bondingCurveV1') as Abi
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
    // V1 has no curveReserve, so ask for it only where it exists rather than letting a failed
    // read fall into the required-globals check below.
    const curveReserveIndex = hasCurveReserve ? contracts.length : -1
    if (hasCurveReserve) {
        contracts.push({
            address: deployment.address,
            abi,
            functionName: 'curveReserve',
            args: [],
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
    const curveReserve =
        curveReserveIndex >= 0 ? ((valueAt(curveReserveIndex) as bigint | undefined) ?? null) : null

    return {
        createFee,
        initialNative,
        virtualAmount,
        graduationAmount,
        nativeReserve,
        tokenReserve,
        curveReserve,
    }
}
