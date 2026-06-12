'use client'

import { useMemo } from 'react'
import { useChainId } from 'wagmi'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { IncentiveRow } from './incentive-row'
import { useIncentives } from '@/hooks/useIncentives'
import { useEarnStore, useMiningSettings } from '@/store/earn-store'
import { getV3StakerAddress } from '@/lib/dex-config'
import { KNOWN_INCENTIVES } from '@/lib/mining-constants'
import type { Incentive } from '@/types/earn'

function LoadingState() {
    return (
        <TableBody>
            {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                    <TableCell>
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                            </div>
                            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                        </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                        <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                        <div className="h-8 w-16 bg-muted rounded animate-pulse ml-auto" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function MiningPools() {
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
    if (!stakerAddress) {
        return (
            <EmptyState
                title="Not available"
                description="LP Mining is not available on this chain."
            />
        )
    }
    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Mining Pools</h2>
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
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pool</TableHead>
                                <TableHead className="hidden md:table-cell">Reward</TableHead>
                                <TableHead>Remaining</TableHead>
                                <TableHead className="hidden md:table-cell">Stakers</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <LoadingState />
                    </Table>
                </Card>
            </div>
        )
    }
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Mining Pools</h2>
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
            {filteredIncentives.length === 0 ? (
                <EmptyState
                    title="No active mining incentives"
                    description="Check back later for new rewards programs."
                />
            ) : (
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pool</TableHead>
                                <TableHead className="hidden md:table-cell">Reward</TableHead>
                                <TableHead>Remaining</TableHead>
                                <TableHead className="hidden md:table-cell">Stakers</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredIncentives.map((incentive) => (
                                <IncentiveRow
                                    key={incentive.incentiveId}
                                    incentive={incentive}
                                    onStake={handleStake}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </div>
    )
}
