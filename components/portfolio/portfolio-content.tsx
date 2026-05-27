'use client'

import { useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Wallet } from 'lucide-react'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { PortfolioSummary } from '@/components/portfolio/portfolio-summary'
import { TokenTable } from '@/components/portfolio/token-table'
import { usePortfolioTokens } from '@/hooks/usePortfolioTokens'
import { usePortfolioBalances } from '@/hooks/usePortfolioBalances'
import { usePortfolioPrices } from '@/hooks/usePortfolioPrices'
import { useUserSwapEvents } from '@/hooks/useUserSwapEvents'
import { usePortfolioPnl } from '@/hooks/usePortfolioPnl'
import { ConnectModal } from '@/components/web3/connect-modal'
import { getChainMetadata } from '@/lib/wagmi'
import type { PortfolioToken, PortfolioSummary as Summary } from '@/types/portfolio'

export function PortfolioContent() {
    const { isConnected, address } = useAccount()
    const chainId = useChainId()
    const { nativeUsdPrice, isLoading: isPriceLoading } = useNativeUsdPriceContext()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    const { tokens, getTokenType } = usePortfolioTokens(chainId, address)
    const { holdings, isLoading: isBalancesLoading } = usePortfolioBalances(tokens)
    const prices = usePortfolioPrices(holdings, nativeUsdPrice, chainId, getTokenType)
    const { data: swapEvents } = useUserSwapEvents(address, chainId)
    const pnlMap = usePortfolioPnl(swapEvents, holdings, prices, nativeUsdPrice)

    const chainMeta = getChainMetadata(chainId)

    const portfolioTokens = useMemo<PortfolioToken[]>(() => {
        const result: PortfolioToken[] = []

        for (const [key, holding] of holdings) {
            const priceUsd = prices.get(key) ?? null
            const balanceNum = parseFloat(holding.formattedBalance)
            const valueUsd = priceUsd !== null ? priceUsd * balanceNum : 0
            const pnl = pnlMap.get(key)
            const tokenType = getTokenType(holding.token)

            result.push({
                token: holding.token,
                balance: holding.rawBalance,
                formattedBalance: holding.formattedBalance,
                priceUsd,
                valueUsd,
                pnlUsd: pnl?.unrealizedPnl ?? null,
                pnlPercent: pnl?.pnlPercent ?? null,
                tokenType,
            })
        }

        return result
    }, [holdings, prices, pnlMap, getTokenType])

    const summary = useMemo<Summary>(() => {
        const netWorth = portfolioTokens.reduce((sum, t) => sum + t.valueUsd, 0)

        const tokensWithPnl = portfolioTokens.filter((t) => t.pnlUsd !== null)
        const totalPnl =
            tokensWithPnl.length > 0
                ? tokensWithPnl.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0)
                : null
        const totalCostBasis = tokensWithPnl.reduce(
            (sum, t) => sum + (t.valueUsd - (t.pnlUsd ?? 0)),
            0
        )
        const totalPnlPercent =
            totalCostBasis > 0 && totalPnl !== null ? (totalPnl / totalCostBasis) * 100 : null

        return { netWorth, totalPnl, totalPnlPercent }
    }, [portfolioTokens])

    const isLoading = isBalancesLoading || isPriceLoading

    if (!isConnected) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="w-full max-w-md space-y-4">
                    <EmptyState
                        icon={Wallet}
                        title="Connect Wallet"
                        description="Connect your wallet to view your portfolio, track net worth, and monitor PNL."
                    />
                    <div className="flex justify-center">
                        <Button onClick={() => setIsConnectModalOpen(true)}>Connect Wallet</Button>
                    </div>
                    <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Portfolio</h1>
                    {chainMeta && (
                        <div className="flex items-center gap-2">
                            <img
                                src={chainMeta.icon}
                                alt={chainMeta.name}
                                className="h-5 w-5 rounded-full"
                            />
                            <span className="text-sm text-muted-foreground font-mono">
                                {chainMeta.name}
                            </span>
                        </div>
                    )}
                </div>

                <PortfolioSummary summary={summary} isLoading={isLoading} />

                <TokenTable tokens={portfolioTokens} isLoading={isLoading} />
            </div>
        </div>
    )
}
