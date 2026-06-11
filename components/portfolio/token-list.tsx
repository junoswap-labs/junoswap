'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenCard } from '@/components/portfolio/token-card'
import type { PortfolioToken } from '@/types/portfolio'

interface TokenListProps {
    tokens: PortfolioToken[]
    isLoading: boolean
}

export function TokenList({ tokens, isLoading }: TokenListProps) {
    const sorted = useMemo(() => {
        return [...tokens].sort((a, b) => b.valueUsd - a.valueUsd)
    }, [tokens])

    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="px-4 py-3">
                            <div className="animate-pulse flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full bg-muted" />
                                    <div className="space-y-2">
                                        <div className="h-4 w-24 bg-muted rounded" />
                                        <div className="h-3 w-32 bg-muted rounded" />
                                    </div>
                                </div>
                                <div className="space-y-2 text-right">
                                    <div className="h-4 w-20 bg-muted rounded ml-auto" />
                                    <div className="h-3 w-28 bg-muted rounded ml-auto" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (tokens.length === 0) {
        return (
            <EmptyState
                title="No Token Balances"
                description="You don't hold any tokens on this chain yet."
                variant="subtle"
            />
        )
    }

    return (
        <div className="space-y-3">
            {sorted.map((token) => (
                <TokenCard key={token.token.address.toLowerCase()} portfolioToken={token} />
            ))}
        </div>
    )
}
