'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContracts } from 'wagmi'
import { parseAbiItem } from 'viem'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_ADDRESS, PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { useTokenList } from '@/hooks/useTokenList'
import type { EnrichedSwapEvent } from '@/types/launchpad'

const SWAP_EVENT = parseAbiItem(
    'event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)'
)

const DEPLOYMENT_BLOCK = 0n

interface RawSwapEvent {
    blockNumber: bigint
    logIndex: number
    timestamp: number
    sender: Address
    isBuy: boolean
    tokenAddr: Address
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    transactionHash: `0x${string}`
}

export function useAllSwapEvents() {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })
    const { tokens } = useTokenList()

    // Build token lookup map from Creation events (has logo)
    const tokenMap = useMemo(() => {
        const map = new Map<string, { logo: string }>()
        for (const token of tokens) {
            map.set(token.address.toLowerCase(), { logo: token.logo })
        }
        return map
    }, [tokens])

    // Fetch all swap events (no tokenAddr filter)
    const {
        data: rawEvents,
        isLoading: isEventsLoading,
        ...rest
    } = useQuery({
        queryKey: ['all-swap-events', PUMP_CORE_NATIVE_CHAIN_ID],
        queryFn: async (): Promise<RawSwapEvent[]> => {
            if (!publicClient) return []

            const logs = await publicClient.getLogs({
                address: PUMP_CORE_NATIVE_ADDRESS,
                event: SWAP_EVENT,
                fromBlock: DEPLOYMENT_BLOCK,
                toBlock: 'latest',
            })

            if (logs.length === 0) return []

            // Deduplicate block numbers and fetch timestamps
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
                logIndex: log.logIndex,
                timestamp: blockMap.get(log.blockNumber) ?? 0,
                sender: log.args.sender as Address,
                isBuy: log.args.isBuy ?? false,
                tokenAddr: log.args.tokenAddr as Address,
                amountIn: log.args.amountIn ?? 0n,
                amountOut: log.args.amountOut ?? 0n,
                reserveIn: log.args.reserveIn ?? 0n,
                reserveOut: log.args.reserveOut ?? 0n,
                transactionHash: log.transactionHash,
            }))
        },
        enabled: !!publicClient,
        staleTime: 15_000,
        refetchInterval: 15_000,
    })

    // Extract unique token addresses from events
    const uniqueAddrs = useMemo(() => {
        if (!rawEvents) return []
        const seen = new Set<string>()
        const addrs: Address[] = []
        for (const event of rawEvents) {
            const lower = event.tokenAddr.toLowerCase()
            if (!seen.has(lower)) {
                seen.add(lower)
                addrs.push(event.tokenAddr)
            }
        }
        return addrs
    }, [rawEvents])

    // Batch fetch symbol for unique tokens
    const { data: symbolResults } = useReadContracts({
        contracts: uniqueAddrs.map((addr) => ({
            address: addr,
            abi: ERC20_ABI,
            functionName: 'symbol' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: uniqueAddrs.length > 0 },
    })

    // Merge into enriched events
    const enrichedEvents: EnrichedSwapEvent[] = useMemo(() => {
        if (!rawEvents) return []

        // Build address -> index lookup for symbol results
        const addrIndexMap = new Map<string, number>()
        uniqueAddrs.forEach((addr, i) => {
            addrIndexMap.set(addr.toLowerCase(), i)
        })

        return rawEvents
            .map((event) => {
                const idx = addrIndexMap.get(event.tokenAddr.toLowerCase()) ?? -1
                const symbol =
                    idx >= 0 ? (symbolResults?.[idx]?.result as string | undefined) : undefined
                const logo = tokenMap.get(event.tokenAddr.toLowerCase())?.logo ?? ''

                return {
                    ...event,
                    tokenSymbol: symbol ?? '???',
                    tokenName: '',
                    tokenLogo: logo,
                }
            })
            .sort((a, b) => {
                // Sort by blockNumber desc, then logIndex desc
                if (b.blockNumber !== a.blockNumber) return Number(b.blockNumber - a.blockNumber)
                return b.logIndex - a.logIndex
            })
            .slice(0, 50)
    }, [rawEvents, uniqueAddrs, symbolResults, tokenMap])

    return {
        data: enrichedEvents,
        isLoading: isEventsLoading,
        ...rest,
    }
}
