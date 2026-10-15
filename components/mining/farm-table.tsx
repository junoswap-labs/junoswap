'use client'

import { useAccount } from 'wagmi'
import { Droplets, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { FarmIdentity, FarmStatusBadge } from './farm-status-badge'
import { EndFarmButton } from './end-farm-button'
import { getFarmStatusAt } from '@/services/mining/farm-list'
import { formatRelativeTimeShort } from '@/lib/duration'
import { formatAprPercent, formatRewardAmount, formatTvl } from '@/lib/format'
import { getDisplayToken } from '@/lib/tokens'
import type { FarmStats } from '@/hooks/useFarmStats'
import type { Incentive } from '@/types/earn'

interface SharedTableProps {
    incentives: readonly Incentive[]
    rewardValueUsd: Record<string, number | undefined>
    now: number
}

function RewardCell({ incentive }: { incentive: Incentive }) {
    return (
        <span className="whitespace-nowrap font-mono tabular-nums">
            {formatRewardAmount(incentive.totalRewardUnclaimed, incentive.rewardTokenInfo.decimals)}{' '}
            <span className="text-muted-foreground">
                {getDisplayToken(incentive.rewardTokenInfo).symbol}
            </span>
        </span>
    )
}

function ValueCell({ value }: { value: number | undefined }) {
    return (
        <span className="whitespace-nowrap tabular-nums">
            {value === undefined ? (
                <span className="text-muted-foreground">—</span>
            ) : (
                formatTvl(value)
            )}
        </span>
    )
}

function ScheduleCell({ incentive, now }: { incentive: Incentive; now: number }) {
    const status = getFarmStatusAt(incentive, now)
    const target = status === 'pending' ? incentive.startTime : incentive.endTime
    return (
        <span className="whitespace-nowrap text-muted-foreground">
            {status === 'pending' ? 'Opens ' : status === 'active' ? 'Ends ' : 'Ended '}
            {formatRelativeTimeShort(target, now)}
        </span>
    )
}

function AprCell({ apr }: { apr: number | undefined }) {
    if (apr === undefined) return <span className="text-muted-foreground">—</span>
    return <span className="font-semibold text-positive tabular-nums">{formatAprPercent(apr)}</span>
}

export function FarmTable({
    incentives,
    rewardValueUsd,
    statsByIncentiveId,
    now,
    onStake,
    onUnstake,
    onAddLiquidity,
    showActions,
    unclaimed,
    onConnect,
}: SharedTableProps & {
    statsByIncentiveId: Record<string, FarmStats>
    onStake: (incentive: Incentive) => void
    onUnstake: (incentive: Incentive) => void
    onAddLiquidity: (incentive: Incentive) => void
    showActions: (incentive: Incentive) => boolean
    unclaimed: (incentive: Incentive) => string | undefined
    onConnect: () => void
}) {
    const { isConnected } = useAccount()

    return (
        <Card className="overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="py-3 px-4">Farm</TableHead>
                        <TableHead className="py-3 px-4">APR</TableHead>
                        <TableHead className="py-3 px-4">Staked TVL</TableHead>
                        <TableHead className="py-3 px-4">Remaining</TableHead>
                        <TableHead className="py-3 px-4">Value</TableHead>
                        <TableHead className="py-3 px-4">Status</TableHead>
                        <TableHead className="py-3 px-4 text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {incentives.map((incentive) => {
                        const status = getFarmStatusAt(incentive, now)
                        const stats = statsByIncentiveId[incentive.incentiveId]
                        return (
                            <TableRow key={incentive.incentiveId} className="border-0">
                                <TableCell className="p-3 px-4">
                                    <FarmIdentity
                                        expandable
                                        incentive={incentive}
                                        size="sm"
                                        withProgram
                                        schedule={<ScheduleCell incentive={incentive} now={now} />}
                                    />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    <AprCell apr={stats?.aprPercent} />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    <ValueCell value={stats?.stakedTvlUsd} />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    <RewardCell incentive={incentive} />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    <ValueCell value={rewardValueUsd[incentive.incentiveId]} />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    <FarmStatusBadge status={status} />
                                </TableCell>
                                <TableCell className="p-3 px-4">
                                    {showActions(incentive) && (
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button
                                                size="sm"
                                                variant={
                                                    status === 'active' ? 'default' : 'outline'
                                                }
                                                disabled={
                                                    isConnected &&
                                                    status !== 'active' &&
                                                    !unclaimed(incentive)
                                                }
                                                onClick={() => {
                                                    if (!isConnected) {
                                                        onConnect()
                                                        return
                                                    }
                                                    if (unclaimed(incentive)) onUnstake(incentive)
                                                    else onStake(incentive)
                                                }}
                                            >
                                                {!isConnected
                                                    ? 'Connect'
                                                    : status === 'active'
                                                      ? 'Stake'
                                                      : status === 'pending'
                                                        ? 'Soon'
                                                        : (unclaimed(incentive) ?? 'Ended')}
                                            </Button>
                                            {isConnected && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 w-8 shrink-0 p-0"
                                                        title="Unstake &amp; claim"
                                                        aria-label="Unstake from this farm"
                                                        onClick={() => onUnstake(incentive)}
                                                    >
                                                        <Minus />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 w-8 shrink-0 p-0"
                                                        title="Add liquidity to this pool"
                                                        aria-label="Add liquidity to this pool"
                                                        onClick={() => onAddLiquidity(incentive)}
                                                    >
                                                        <Droplets />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </Card>
    )
}

export function MyFarmTable({
    incentives,
    rewardValueUsd,
    now,
    onSettled,
}: SharedTableProps & { onSettled: () => void }) {
    return (
        <Card className="overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="py-3 px-4">Farm</TableHead>
                        <TableHead className="py-3 px-4">Undistributed</TableHead>
                        <TableHead className="py-3 px-4">Value</TableHead>
                        <TableHead className="py-3 px-4">Status</TableHead>
                        <TableHead className="py-3 px-4 text-right">Staked</TableHead>
                        <TableHead className="py-3 px-4 text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {incentives.map((incentive) => (
                        <TableRow key={incentive.incentiveId} className="border-0">
                            <TableCell className="p-3 px-4">
                                <FarmIdentity
                                    incentive={incentive}
                                    size="sm"
                                    withProgram
                                    schedule={<ScheduleCell incentive={incentive} now={now} />}
                                />
                            </TableCell>
                            <TableCell className="p-3 px-4">
                                <RewardCell incentive={incentive} />
                            </TableCell>
                            <TableCell className="p-3 px-4">
                                <ValueCell value={rewardValueUsd[incentive.incentiveId]} />
                            </TableCell>
                            <TableCell className="p-3 px-4">
                                <FarmStatusBadge status={getFarmStatusAt(incentive, now)} />
                            </TableCell>
                            <TableCell className="p-3 px-4 text-right tabular-nums">
                                {incentive.numberOfStakes}
                            </TableCell>
                            <TableCell className="p-3 px-4 text-right">
                                <EndFarmButton
                                    incentive={incentive}
                                    onSettled={onSettled}
                                    size="sm"
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    )
}
