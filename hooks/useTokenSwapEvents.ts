'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_ADDRESS, PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'

const SWAP_EVENT = parseAbiItem(
    'event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)'
)

const DEPLOYMENT_BLOCK = 0n

export interface SwapEventData {
    blockNumber: bigint
    timestamp: number
    sender: Address
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    transactionHash: `0x${string}`
}

export function useTokenSwapEvents(tokenAddr: Address | undefined) {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    return useQuery({
        queryKey: ['token-swap-events', tokenAddr, PUMP_CORE_NATIVE_CHAIN_ID],
        queryFn: async (): Promise<SwapEventData[]> => {
            if (!publicClient || !tokenAddr) return []

            const logs = await publicClient.getLogs({
                address: PUMP_CORE_NATIVE_ADDRESS,
                event: SWAP_EVENT,
                args: {
                    tokenAddr,
                },
                fromBlock: DEPLOYMENT_BLOCK,
                toBlock: 'latest',
            })

            if (logs.length === 0) return []

            // Fetch block timestamps — deduplicate block numbers
            const blockNumbers = [...new Set(logs.map((l) => l.blockNumber))]
            const blockMap = new Map<bigint, number>()

            await Promise.all(
                blockNumbers.map(async (bn) => {
                    const block = await publicClient.getBlock({ blockNumber: bn })
                    blockMap.set(bn, Number(block.timestamp))
                })
            )

            return logs.map((log) => ({
                blockNumber: log.blockNumber,
                timestamp: blockMap.get(log.blockNumber) ?? 0,
                sender: log.args.sender as Address,
                isBuy: log.args.isBuy ?? false,
                amountIn: log.args.amountIn ?? 0n,
                amountOut: log.args.amountOut ?? 0n,
                reserveIn: log.args.reserveIn ?? 0n,
                reserveOut: log.args.reserveOut ?? 0n,
                transactionHash: log.transactionHash,
            }))
        },
        enabled: !!publicClient && !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
