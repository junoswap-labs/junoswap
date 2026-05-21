import { parseAbiItem } from 'viem'
import type { Address, PublicClient } from 'viem'
import { PUMP_CORE_NATIVE_ADDRESS, PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { calculatePrice } from '@/services/chart'
import type { LaunchToken, EnrichedSwapEvent } from '@/types/launchpad'

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n

const CREATION_EVENT = parseAbiItem(
    'event Creation(address indexed creator, address tokenAddr, string logo, string description, string link1, string link2, string link3, uint256 createdTime)'
)

const SWAP_EVENT = parseAbiItem(
    'event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)'
)

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
    tokenAddr: Address
}

export interface HolderData {
    address: Address
    balance: bigint
    percentage: number
}

export async function fetchTokenListRpc(publicClient: PublicClient): Promise<LaunchToken[]> {
    const logs = await publicClient.getLogs({
        address: PUMP_CORE_NATIVE_ADDRESS,
        event: CREATION_EVENT,
        fromBlock: 0n,
        toBlock: 'latest',
    })

    const tokens: LaunchToken[] = logs.map((log) => ({
        address: log.args.tokenAddr as Address,
        name: '',
        symbol: '',
        logo: log.args.logo ?? '',
        description: log.args.description ?? '',
        link1: log.args.link1 ?? '',
        link2: log.args.link2 ?? '',
        link3: log.args.link3 ?? '',
        creator: log.args.creator as Address,
        createdTime: Number(log.args.createdTime ?? 0),
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    }))

    tokens.sort((a, b) => b.createdTime - a.createdTime)
    return tokens
}

export async function fetchTokenSwapEventsRpc(
    publicClient: PublicClient,
    tokenAddr?: Address
): Promise<SwapEventData[]> {
    const logs = await publicClient.getLogs({
        address: PUMP_CORE_NATIVE_ADDRESS,
        event: SWAP_EVENT,
        args: tokenAddr ? { tokenAddr } : undefined,
        fromBlock: 0n,
        toBlock: 'latest',
    })

    if (logs.length === 0) return []

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
        tokenAddr: log.args.tokenAddr as Address,
        amountIn: log.args.amountIn ?? 0n,
        amountOut: log.args.amountOut ?? 0n,
        reserveIn: log.args.reserveIn ?? 0n,
        reserveOut: log.args.reserveOut ?? 0n,
        transactionHash: log.transactionHash,
    }))
}

export async function fetchAllSwapEventsRpc(
    publicClient: PublicClient,
    tokenList: LaunchToken[]
): Promise<EnrichedSwapEvent[]> {
    const rawEvents = await fetchTokenSwapEventsRpc(publicClient)

    if (rawEvents.length === 0) return []

    // Build logo lookup from token list
    const logoMap = new Map<string, string>()
    for (const token of tokenList) {
        logoMap.set(token.address.toLowerCase(), token.logo ?? '')
    }

    // Get unique token addresses for symbol lookup
    const uniqueAddrs = [...new Set(rawEvents.map((e) => e.tokenAddr.toLowerCase()))]

    // Batch fetch ERC20 symbols via multicall
    const symbolResults = await Promise.all(
        uniqueAddrs.map(async (addr) => {
            try {
                return await publicClient.readContract({
                    address: addr as Address,
                    abi: ERC20_ABI,
                    functionName: 'symbol',
                })
            } catch {
                return undefined
            }
        })
    )

    const symbolMap = new Map<string, string>()
    uniqueAddrs.forEach((addr, i) => {
        symbolMap.set(addr, (symbolResults[i] as string | undefined) ?? '???')
    })

    return rawEvents
        .map((event) => ({
            ...event,
            logIndex: 0,
            tokenAddr: event.tokenAddr,
            tokenSymbol: symbolMap.get(event.tokenAddr.toLowerCase()) ?? '???',
            tokenName: '',
            tokenLogo: logoMap.get(event.tokenAddr.toLowerCase()) ?? '',
        }))
        .sort((a, b) => {
            if (b.blockNumber !== a.blockNumber) return Number(b.blockNumber - a.blockNumber)
            return 0
        })
        .slice(0, 50)
}

export function computeHoldersFromEvents(events: SwapEventData[]): {
    holders: HolderData[]
    holderCount: number
} {
    if (events.length === 0) return { holders: [], holderCount: 0 }

    const balanceMap = new Map<Address, bigint>()

    for (const event of events) {
        const current = balanceMap.get(event.sender) ?? 0n
        if (event.isBuy) {
            balanceMap.set(event.sender, current + event.amountOut)
        } else {
            balanceMap.set(event.sender, current - event.amountIn)
        }
    }

    const holders: HolderData[] = Array.from(balanceMap.entries())
        .filter(([, balance]) => balance > 0n)
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .slice(0, 20)
        .map(([address, balance]) => ({
            address,
            balance,
            percentage: TOTAL_SUPPLY > 0n ? Number((balance * 10000n) / TOTAL_SUPPLY) / 100 : 0,
        }))

    const holderCount = Array.from(balanceMap.values()).filter((b) => b > 0n).length

    return { holders, holderCount }
}

export function computePriceFromEvents(events: SwapEventData[]): {
    currentPrice: number | null
    priceChangePercent24h: number | null
    isPositive: boolean | null
} {
    if (events.length === 0) {
        return { currentPrice: null, priceChangePercent24h: null, isPositive: null }
    }

    const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp)
    const latestEvent = sorted[0]
    if (!latestEvent) return { currentPrice: null, priceChangePercent24h: null, isPositive: null }

    const currentPrice = calculatePrice(latestEvent)

    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - 86400
    const pastEvent = sorted.find((e) => e.timestamp <= oneDayAgo)

    let priceChangePercent24h: number | null = null
    let isPositive: boolean | null = null

    if (pastEvent) {
        const pastPrice = calculatePrice(pastEvent)
        if (pastPrice > 0 && currentPrice > 0) {
            priceChangePercent24h = ((currentPrice - pastPrice) / pastPrice) * 100
            isPositive = priceChangePercent24h >= 0
        }
    }

    return {
        currentPrice: currentPrice > 0 ? currentPrice : null,
        priceChangePercent24h,
        isPositive,
    }
}
