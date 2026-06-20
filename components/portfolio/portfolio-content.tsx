'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useChainId } from 'wagmi'
import { formatAddress } from '@/lib/utils'
import { Jazzicon } from '@/components/web3/jazzicon'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioSummary } from '@/components/portfolio/portfolio-summary'
import { TokenList } from '@/components/portfolio/token-list'
import { ActivityTab } from '@/components/portfolio/activity-tab'
import { usePortfolioTokens } from '@/hooks/usePortfolioTokens'
import { usePortfolioBalances } from '@/hooks/usePortfolioBalances'
import { usePortfolioPrices } from '@/hooks/usePortfolioPrices'
import { useUserSwapEvents } from '@/hooks/useUserSwapEvents'
import { useNativeUsdPriceHistory } from '@/hooks/useNativeUsdPriceHistory'
import { usePortfolioPnl } from '@/hooks/usePortfolioPnl'
import { ConnectModal } from '@/components/web3/connect-modal'
import type { PortfolioToken, PortfolioSummary as Summary } from '@/types/portfolio'

export function PortfolioContent() {
    const { address: connectedAddress } = useAccount()
    const searchParams = useSearchParams()
    const chainId = useChainId()

    // A trader clicked from the leaderboard/points table arrives with ?address=,
    // letting the page render any wallet's portfolio, not just the connected one.
    const viewedParam = searchParams.get('address')
    const address = (viewedParam ?? connectedAddress) as `0x${string}` | undefined
    const { nativeUsdPrice, isLoading: isPriceLoading } = useNativeUsdPriceContext()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'holdings' | 'activity'>('holdings')

    const { tokens, getTokenType } = usePortfolioTokens(chainId, address)
    const { holdings, isLoading: isBalancesLoading } = usePortfolioBalances(
        tokens,
        chainId,
        address
    )
    const prices = usePortfolioPrices(holdings, nativeUsdPrice, chainId, getTokenType)
    const { data: swapEvents } = useUserSwapEvents(address, chainId)
    const { priceAt } = useNativeUsdPriceHistory(chainId, nativeUsdPrice)
    const { pnlByToken, totals: pnlTotals } = usePortfolioPnl(swapEvents, holdings, prices, priceAt)

    const portfolioTokens = useMemo<PortfolioToken[]>(() => {
        const result: PortfolioToken[] = []

        for (const [key, holding] of holdings) {
            const priceUsd = prices.get(key) ?? null
            const balanceNum = parseFloat(holding.formattedBalance)
            const valueUsd = priceUsd !== null ? priceUsd * balanceNum : 0
            const pnl = pnlByToken.get(key)
            const tokenType = getTokenType(holding.token)

            result.push({
                token: holding.token,
                balance: holding.rawBalance,
                formattedBalance: holding.formattedBalance,
                priceUsd,
                valueUsd,
                pnlUsd: pnl?.totalPnlUsd ?? null,
                pnlPercent: pnl?.pnlPercent ?? null,
                tokenType,
            })
        }

        return result
    }, [holdings, prices, pnlByToken, getTokenType])

    const summary = useMemo<Summary>(() => {
        const netWorth = portfolioTokens.reduce((sum, t) => sum + t.valueUsd, 0)

        // Total PnL aggregates every traded token (incl. fully-exited positions),
        // so realized gains aren't lost when a position no longer shows as a holding.
        const hasPnl = pnlTotals.totalInvestedUsd > 0
        const totalPnl = hasPnl ? pnlTotals.totalPnlUsd : null
        const totalPnlPercent = hasPnl ? pnlTotals.totalPnlPercent : null

        return { netWorth, totalPnl, totalPnlPercent }
    }, [portfolioTokens, pnlTotals])

    const isLoading = isBalancesLoading || isPriceLoading

    if (!address) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="w-full max-w-md space-y-4">
                    <EmptyState
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
                <div className="flex items-center gap-3">
                    <Jazzicon
                        address={address}
                        size={32}
                        className="flex-shrink-0 overflow-hidden rounded-full [&>div]:rounded-full"
                    />
                    <h1 className="text-2xl font-bold">
                        <span className="font-mono">{formatAddress(address)}</span>{' '}
                        <span className="text-lg font-normal text-muted-foreground">Portfolio</span>
                    </h1>
                </div>

                <PortfolioSummary summary={summary} isLoading={isLoading} />

                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'holdings' | 'activity')}
                >
                    <TabsList>
                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                    </TabsList>

                    <TabsContent value="holdings">
                        <TokenList tokens={portfolioTokens} isLoading={isLoading} />
                    </TabsContent>

                    <TabsContent value="activity">
                        <ActivityTab address={address!} chainId={chainId} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
