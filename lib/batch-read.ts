import type { Abi, Address, PublicClient } from 'viem'

export interface ReadCall {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
}

// kubTestnet has no multicall3 in its chain definition, so viem's multicall throws there.
// Fall back to one read per call rather than losing the whole batch.
export async function batchRead(
    client: PublicClient,
    calls: readonly ReadCall[]
): Promise<(unknown | undefined)[]> {
    if (calls.length === 0) return []
    try {
        const results = await client.multicall({ contracts: calls, allowFailure: true })
        return results.map((r) => (r.status === 'success' ? r.result : undefined))
    } catch {
        const settled = await Promise.allSettled(calls.map((call) => client.readContract(call)))
        return settled.map((o) => (o.status === 'fulfilled' ? o.value : undefined))
    }
}
