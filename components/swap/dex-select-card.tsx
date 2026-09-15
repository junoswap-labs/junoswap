'use client'

import { useMemo, useEffect } from 'react'
import { useChainId } from 'wagmi'
import { parseUnits } from 'viem'
import { useSwapStore } from '@/store/swap-store'
import { useMultiDexQuotes } from '@/hooks/useMultiDexQuotes'
import { getDexes } from '@coshi190/juno-moneta-sdk'
import { DEX_REGISTRY } from '@/lib/dex-meta'
import { percentDiff } from '@/lib/routing-config'
import { formatDisplayAmount } from '@/lib/tokens'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const BEST_TAG = (
    <span className="shrink-0 rounded bg-positive/10 px-1.5 py-px text-[11px] font-medium leading-4 text-positive">
        Best
    </span>
)

export function DexSelectCard() {
    const {
        selectedDex,
        setSelectedDex,
        setAutoSelectBestDex,
        tokenIn,
        tokenOut,
        amountIn,
        settings,
        aggRouteKind,
        aggPredictedOut,
    } = useSwapStore()
    const chainId = useChainId()
    const supportedDexs = getDexes(chainId).map((dex) => dex.dexId)
    const amountInBigInt = useMemo(() => {
        if (!amountIn || !tokenIn) return 0n
        try {
            return parseUnits(amountIn, tokenIn.decimals)
        } catch {
            return 0n
        }
    }, [amountIn, tokenIn])
    const { dexQuotes, bestQuoteDex, priceDifferences } = useMultiDexQuotes({
        tokenIn,
        tokenOut,
        amountIn: amountInBigInt,
        enabled: !!tokenIn && !!tokenOut && amountInBigInt > 0n,
    })
    const aggActive = aggRouteKind !== null && aggPredictedOut !== null
    useEffect(() => {
        if (settings?.autoSelectBestDex && bestQuoteDex && bestQuoteDex !== selectedDex) {
            setSelectedDex(bestQuoteDex)
        }
    }, [bestQuoteDex, selectedDex, setSelectedDex, settings?.autoSelectBestDex])
    const availableDexs = Object.values(DEX_REGISTRY).filter((dex) =>
        supportedDexs.includes(dex.id)
    )
    if (!DEX_REGISTRY[selectedDex]) {
        return null
    }
    const renderQuote = (dexId: string) => {
        const quoteData = dexQuotes[dexId]
        if (!quoteData) {
            return <span className="text-xs text-muted-foreground/40">—</span>
        }
        if (quoteData.isLoading) {
            return <span className="animate-pulse text-xs text-muted-foreground/50">···</span>
        }
        if (quoteData.isError || !quoteData.quote || !tokenOut) {
            return <span className="text-xs text-muted-foreground/50">No quote</span>
        }
        return (
            <span className="text-xs tabular-nums text-foreground/80">
                {formatDisplayAmount(quoteData.quote.amountOut, tokenOut.decimals)}{' '}
                {tokenOut.symbol}
            </span>
        )
    }
    const renderDiff = (dexId: string) => {
        const quoteData = dexQuotes[dexId]
        if (!quoteData?.quote) return null
        const priceDiff = aggActive
            ? percentDiff(quoteData.quote.amountOut, aggPredictedOut!)
            : priceDifferences[dexId]
        if (priceDiff === null || priceDiff === undefined || priceDiff === 0) return null
        return (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                {priceDiff > 0 ? '+' : ''}
                {priceDiff.toFixed(2)}%
            </span>
        )
    }
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Route</span>
                    <button
                        type="button"
                        onClick={() => {
                            const next = !settings.autoSelectBestDex
                            setAutoSelectBestDex(next)
                            if (next && bestQuoteDex) {
                                setSelectedDex(bestQuoteDex)
                            }
                        }}
                        className={cn(
                            'h-6 rounded-md px-2 text-xs transition-colors',
                            settings.autoSelectBestDex
                                ? 'bg-positive/15 font-medium text-positive'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                    >
                        Auto
                    </button>
                </div>
                <div className="mb-2 mt-2 h-px bg-border/60" />
                <div className="space-y-1">
                    {aggActive && tokenOut && (
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-positive/[0.05] px-2.5 py-2 ring-1 ring-inset ring-positive/30">
                            <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-xs font-medium text-foreground">
                                    Junoswap Aggregator
                                </span>
                                {BEST_TAG}
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-foreground/80">
                                {formatDisplayAmount(aggPredictedOut!, tokenOut.decimals)}{' '}
                                {tokenOut.symbol}
                            </span>
                        </div>
                    )}
                    {availableDexs.map((dex) => {
                        const isSelected = !aggActive && dex.id === selectedDex
                        const isBest = !aggActive && bestQuoteDex === dex.id
                        return (
                            <button
                                key={dex.id}
                                type="button"
                                onClick={() => {
                                    setAutoSelectBestDex(false)
                                    setSelectedDex(dex.id)
                                }}
                                className={cn(
                                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                                    isSelected
                                        ? 'bg-muted/50 ring-1 ring-inset ring-positive/30'
                                        : 'hover:bg-muted/40'
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span
                                            className={cn(
                                                'truncate text-xs',
                                                isSelected
                                                    ? 'font-medium text-foreground'
                                                    : 'text-muted-foreground'
                                            )}
                                        >
                                            {dex.displayName}
                                        </span>
                                        {isBest ? BEST_TAG : renderDiff(dex.id)}
                                    </div>
                                    <span className="shrink-0">{renderQuote(dex.id)}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
