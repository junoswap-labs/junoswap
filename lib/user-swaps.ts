import { getJson, ponderBaseUrl } from '@/lib/indexer-http'

export interface UserSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

interface UserSwapsResponse {
    swaps: UserSwapEvent[]
}

export async function fetchUserSwapEvents(
    chainId: number,
    address: string
): Promise<UserSwapEvent[]> {
    const baseUrl = ponderBaseUrl()
    if (!baseUrl) return []
    try {
        const res = await getJson<UserSwapsResponse>(
            `${baseUrl}/user-swaps?chainId=${chainId}&user=${address.toLowerCase()}`
        )
        return res.swaps
    } catch {
        return []
    }
}
