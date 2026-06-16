'use client'

import { useMemo } from 'react'
import { useChainId } from 'wagmi'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenIconSkeleton } from '@/components/ui/token-icon'
import { MiningFarmCard } from './farm-card'
import { useIncentives } from '@/hooks/useIncentives'
import { useEarnStore, useMiningSettings } from '@/store/earn-store'
import { getV3StakerAddress } from '@/lib/dex-config'
import { KNOWN_INCENTIVES } from '@/lib/mining-constants'
import type { Incentive } from '@/types/earn'

function FarmCardSkeleton() {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="animate-pulse space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                                <TokenIconSkeleton size="md" />
                                <TokenIconSkeleton size="md" />
                            </div>
                            <div className="space-y-1.5">
                                <div className="h-4 w-28 bg-muted rounded" />
                                <div className="h-3 w-20 bg-muted rounded" />
                            </div>
                        </div>
                        <div className="h-5 w-16 bg-muted rounded-full" />
                    </div>
                    <div className="h-[1px] bg-muted" />
                    <div className="grid grid-cols-2 gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-16 bg-muted rounded" />
                                <div className="h-5 w-20 bg-muted rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="h-9 w-full bg-muted rounded-xl" />
                </div>
            </CardContent>
        </Card>
    )
}

export function MiningFarms() {
    const chainId = useChainId()
    const stakerAddress = getV3StakerAddress(chainId)
    const { openStakeDialog, setHideEndedIncentives } = useEarnStore()
    const miningSettings = useMiningSettings()
    const incentiveKeys = useMemo(() => KNOWN_INCENTIVES[chainId] ?? [], [chainId])
    const { incentives, isLoading } = useIncentives(incentiveKeys)
    const filteredIncentives = useMemo(() => {
        if (!miningSettings.hideEndedIncentives) return incentives
        return incentives.filter((i) => !i.isEnded)
    }, [incentives, miningSettings.hideEndedIncentives])
    const handleStake = (incentive: Incentive) => {
        openStakeDialog(incentive)
    }

    const header = (
        <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Mining Farms</h2>
            <div className="flex items-center space-x-2">
                <Switch
                    id="hide-ended"
                    checked={miningSettings.hideEndedIncentives}
                    onCheckedChange={setHideEndedIncentives}
                />
                <Label htmlFor="hide-ended" className="text-sm">
                    Hide ended
                </Label>
            </div>
        </div>
    )

    if (!stakerAddress) {
        return (
            <div className="space-y-4">
                {header}
                <EmptyState
                    title="Not available"
                    description="LP Mining is not available on this chain."
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {header}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <FarmCardSkeleton key={i} />
                    ))}
                </div>
            ) : filteredIncentives.length === 0 ? (
                <EmptyState
                    title="No active mining farms"
                    description="Check back later for new rewards programs."
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredIncentives.map((incentive) => (
                        <MiningFarmCard
                            key={incentive.incentiveId}
                            incentive={incentive}
                            onStake={handleStake}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
