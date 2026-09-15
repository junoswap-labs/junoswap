'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
    fetchUserBondingCurveSwaps,
    fetchUserV3Swaps,
    fetchUserV2Swaps,
    fetchUserTransfers,
    fetchUserAggSwaps,
    fetchLaunchTokens,
    fetchV3Tokens,
} from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment, getAggRouterDeployment } from '@/lib/deployments'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { findTokenByAddress, getTokensForChain, findWrappedNativeAddress } from '@/lib/tokens'
import { NATIVE_TOKEN_ADDRESS } from '@/lib/wagmi'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import { LAUNCH_TOKEN_META_FIELDS } from '@/lib/ponder-fields'
import type { ActivityEvent, ActivityLeg } from '@/types/portfolio'

const PAGE_SIZE = 20
const NATIVE_ADDRESS: string = NATIVE_TOKEN_ADDRESS

interface TokenMeta {
    symbol: string
    name: string
    logo: string
    decimals: number
}

function fetchBondingCurveEvents(sender: string, chainId: number, limit: number) {
    return fetchUserBondingCurveSwaps(ponderClient, { sender, chainId, limit })
}

function fetchV3Events(sender: string, chainId: number, limit: number) {
    return fetchUserV3Swaps(ponderClient, { sender, chainId, limit })
}

function fetchV2Events(sender: string, chainId: number, limit: number) {
    return fetchUserV2Swaps(ponderClient, { sender, chainId, limit })
}

function fetchTransferEvents(sender: string, chainId: number, limit: number) {
    return fetchUserTransfers(ponderClient, { sender, chainId, limit })
}

function fetchAggEvents(sender: string, chainId: number, limit: number) {
    return fetchUserAggSwaps(ponderClient, { sender, chainId, limit })
}

async function fetchTokenMeta(chainId: number): Promise<Map<string, TokenMeta>> {
    const rows = await fetchLaunchTokens(ponderClient, { chainId }, LAUNCH_TOKEN_META_FIELDS)
    const map = new Map<string, TokenMeta>()
    for (const raw of rows) {
        const t = applyLaunchpadTokenOverride(raw, chainId)
        map.set(t.tokenAddr.toLowerCase(), {
            symbol: t.symbol || '',
            name: t.name || '',
            logo: resolveLaunchpadLogo(t.logo),
            decimals: 18,
        })
    }
    return map
}

async function fetchV3TokenMeta(chainId: number): Promise<Map<string, TokenMeta>> {
    const rows = await fetchV3Tokens(ponderClient, { chainId })
    const map = new Map<string, TokenMeta>()
    for (const t of rows) {
        map.set(t.address.toLowerCase(), {
            symbol: t.symbol || '',
            name: t.name || '',
            logo: '',
            decimals: t.decimals ?? 18,
        })
    }
    return map
}

export function useUserActivity(
    address: Address | undefined,
    chainId: number,
    page: number = 1,
    typeFilter: 'all' | 'buy' | 'sell' = 'all'
) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const hasLaunchpad = getBondingCurveDeployment(chainId) !== undefined

    return useQuery({
        queryKey: ['user-activity', address, chainId, page, typeFilter],
        queryFn: async (): Promise<{ data: ActivityEvent[]; totalCount: number }> => {
            if (!address || !isSupportedChain) return { data: [], totalCount: 0 }

            const sender = address.toLowerCase()

            try {
                const [
                    launchMeta,
                    v3Meta,
                    bcResult,
                    v3Result,
                    v2Result,
                    transferResult,
                    aggResult,
                ] = await Promise.all([
                    hasLaunchpad
                        ? fetchTokenMeta(chainId)
                        : Promise.resolve(new Map<string, TokenMeta>()),
                    fetchV3TokenMeta(chainId),
                    hasLaunchpad
                        ? fetchBondingCurveEvents(sender, chainId, PAGE_SIZE + 50)
                        : Promise.resolve([]),
                    fetchV3Events(sender, chainId, PAGE_SIZE + 50),
                    fetchV2Events(sender, chainId, PAGE_SIZE + 50),
                    hasLaunchpad
                        ? fetchTransferEvents(sender, chainId, PAGE_SIZE + 50)
                        : Promise.resolve([]),
                    getAggRouterDeployment(chainId) !== undefined
                        ? fetchAggEvents(sender, chainId, PAGE_SIZE + 50)
                        : Promise.resolve([]),
                ])

                const tokenMeta = new Map(launchMeta)
                for (const t of getTokensForChain(chainId)) {
                    const addr = t.address.toLowerCase()
                    if (!tokenMeta.has(addr)) {
                        tokenMeta.set(addr, {
                            symbol: t.symbol,
                            name: t.name,
                            logo: resolveLaunchpadLogo(t.logo),
                            decimals: t.decimals ?? 18,
                        })
                    }
                }
                for (const [addr, meta] of v3Meta) {
                    if (!tokenMeta.has(addr)) tokenMeta.set(addr, meta)
                }

                const aggTxHashes = new Set(aggResult.map((e) => e.transactionHash))
                const bcItems = bcResult.filter((e) => !aggTxHashes.has(e.transactionHash))
                const v3Items = v3Result.filter((e) => !aggTxHashes.has(e.transactionHash))
                const v2Items = v2Result.filter((e) => !aggTxHashes.has(e.transactionHash))

                const wrappedNative = findWrappedNativeAddress(chainId)?.toLowerCase()
                const nativeToken = findTokenByAddress(chainId, NATIVE_ADDRESS)
                const nativeLegMeta = nativeToken
                    ? {
                          symbol: nativeToken.symbol,
                          logo: resolveLaunchpadLogo(nativeToken.logo),
                          decimals: nativeToken.decimals ?? 18,
                      }
                    : null
                const resolveAggLeg = (addr: string, amount: string): ActivityLeg => {
                    const a = addr.toLowerCase()
                    if (wrappedNative && a === wrappedNative && nativeLegMeta) {
                        return {
                            tokenAddr: a,
                            symbol: nativeLegMeta.symbol,
                            logo: nativeLegMeta.logo,
                            amount,
                            decimals: nativeLegMeta.decimals,
                        }
                    }
                    const m = tokenMeta.get(a)
                    return {
                        tokenAddr: a,
                        symbol: m?.symbol || a.slice(0, 6) + '…',
                        logo: m?.logo || '',
                        amount,
                        decimals: m?.decimals ?? 18,
                    }
                }

                const bcEvents: ActivityEvent[] = bcItems.map((e) => {
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                        tokenName: meta?.name || '',
                        tokenLogo: meta?.logo || '',
                        isBuy: e.isBuy === 1,
                        amountIn: e.amountIn,
                        amountOut: e.amountOut,
                        protocol: 'junoswap',
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.sender,
                    }
                })

                const v3Events: ActivityEvent[] = v3Items.map((e) => {
                    const tokenIsToken0 = e.tokenIsToken0 === 1
                    const tokenAmt = BigInt(tokenIsToken0 ? e.amount0 : e.amount1)
                    const nativeAmt = BigInt(tokenIsToken0 ? e.amount1 : e.amount0)
                    const abs = (x: bigint) => (x < 0n ? -x : x)
                    const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                        tokenName: meta?.name || '',
                        tokenLogo: meta?.logo || '',
                        isBuy,
                        amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
                        amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
                        protocol:
                            !e.protocol || e.protocol === 'junoswap' ? 'junoswap-amm' : e.protocol,
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.txFrom,
                    }
                })

                const legMeta = (addr: string): ActivityLeg => {
                    const a = addr.toLowerCase()
                    const m = tokenMeta.get(a)
                    return {
                        tokenAddr: a,
                        symbol: m?.symbol || a.slice(0, 6) + '…',
                        logo: m?.logo || '',
                        amount: '0',
                        decimals: m?.decimals ?? 18,
                    }
                }
                const v2Events: ActivityEvent[] = v2Items.map((e) => {
                    const sellToken0 = BigInt(e.amount0In) > 0n
                    const soldAddr = sellToken0 ? e.token0Addr : e.token1Addr
                    const boughtAddr = sellToken0 ? e.token1Addr : e.token0Addr
                    const soldAmt = (sellToken0 ? e.amount0In : e.amount1In).toString()
                    const boughtAmt = (sellToken0 ? e.amount1Out : e.amount0Out).toString()
                    const sell = { ...legMeta(soldAddr), amount: soldAmt }
                    const buy = { ...legMeta(boughtAddr), amount: boughtAmt }
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: buy.tokenAddr,
                        tokenSymbol: buy.symbol,
                        tokenName: '',
                        tokenLogo: buy.logo,
                        isBuy: true,
                        amountIn: soldAmt,
                        amountOut: boughtAmt,
                        protocol: e.protocol === 'junoswap' ? 'junoswap-amm' : e.protocol,
                        sell,
                        buy,
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.txFrom,
                    }
                })

                const aggEvents: ActivityEvent[] = aggResult.map((e) => {
                    const sell = resolveAggLeg(e.tokenIn, e.amountIn)
                    const buy = resolveAggLeg(e.tokenOut, e.amountOut)
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: buy.tokenAddr,
                        tokenSymbol: buy.symbol,
                        tokenName: '',
                        tokenLogo: buy.logo,
                        isBuy: true,
                        amountIn: e.amountIn,
                        amountOut: e.amountOut,
                        protocol: 'junoswap-aggregator',
                        sell,
                        buy,
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.sender,
                    }
                })

                const swapTxHashes = new Set([
                    ...bcItems.map((e) => e.transactionHash),
                    ...v3Items.map((e) => e.transactionHash),
                    ...v2Items.map((e) => e.transactionHash),
                    ...aggTxHashes,
                ])

                const transferEvents: ActivityEvent[] = transferResult
                    .filter((e) => !swapTxHashes.has(e.transactionHash))
                    .map((e) => {
                        const isReceived = e.to.toLowerCase() === sender
                        const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                        return {
                            kind: 'transfer' as const,
                            id: e.id,
                            tokenAddr: e.tokenAddr.toLowerCase(),
                            tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                            tokenName: meta?.name || '',
                            tokenLogo: meta?.logo || '',
                            isBuy: false,
                            amountIn: '0',
                            amountOut: '0',
                            direction: isReceived ? ('in' as const) : ('out' as const),
                            counterparty: (isReceived ? e.from : e.to).toLowerCase(),
                            transferAmount: e.amount,
                            timestamp: e.timestamp,
                            transactionHash: e.transactionHash,
                            sender,
                        }
                    })

                let allEvents = [
                    ...bcEvents,
                    ...v3Events,
                    ...v2Events,
                    ...aggEvents,
                    ...transferEvents,
                ].sort((a, b) => b.timestamp - a.timestamp)

                if (typeFilter !== 'all') {
                    const isBuyFilter = typeFilter === 'buy'
                    allEvents = allEvents.filter(
                        (e) => e.kind === 'trade' && e.isBuy === isBuyFilter
                    )
                }

                const totalCount = allEvents.length
                const start = (page - 1) * PAGE_SIZE
                const data = allEvents.slice(start, start + PAGE_SIZE)

                return { data, totalCount }
            } catch (e) {
                if (isPonderError(e)) return { data: [], totalCount: 0 }
                throw e
            }
        },
        enabled: !!address && isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
