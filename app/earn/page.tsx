'use client'

import { Suspense, useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PoolsList } from '@/components/positions/pools'
import { PositionsList } from '@/components/positions/positions-list'
import { AddLiquidityDialog } from '@/components/positions/add-liquidity-dialog'
import { RemoveLiquidityDialog } from '@/components/positions/remove-liquidity-dialog'
import { CollectFeesDialog } from '@/components/positions/collect-fees-dialog'
import { IncreaseLiquidityDialog } from '@/components/positions/increase-liquidity-dialog'
import { MiningFarms, StakeDialog, UnstakeDialog } from '@/components/mining'
import { ConnectModal } from '@/components/web3/connect-modal'
import type { PositionWithTokens, Incentive, StakedPosition, V3PoolData } from '@/types/earn'

function EarnContent() {
    const { isConnected } = useAccount()
    const [activeTab, setActiveTab] = useState<'pools' | 'positions'>('pools')
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    const [selectedPosition, setSelectedPosition] = useState<PositionWithTokens | null>(null)
    const [selectedIncentive, setSelectedIncentive] = useState<Incentive | null>(null)
    const [selectedStakedPosition, setSelectedStakedPosition] = useState<StakedPosition | null>(
        null
    )

    const [isAddLiquidityOpen, setIsAddLiquidityOpen] = useState(false)
    const [addLiquidityPool, setAddLiquidityPool] = useState<V3PoolData | null>(null)
    const [isRemoveLiquidityOpen, setIsRemoveLiquidityOpen] = useState(false)
    const [isCollectFeesOpen, setIsCollectFeesOpen] = useState(false)
    const [isIncreaseLiquidityOpen, setIsIncreaseLiquidityOpen] = useState(false)
    const [isStakeDialogOpen, setIsStakeDialogOpen] = useState(false)
    const [isUnstakeDialogOpen, setIsUnstakeDialogOpen] = useState(false)

    // After a position mutation confirms (stake/unstake, add/remove/collect),
    // invalidate the query cache so every mounted reader (the stake dialog's
    // eligible-positions list, the positions list, etc.) refetches instead of
    // serving pre-tx cache. The nonce additionally drives the localStorage
    // re-read in useDepositedTokenIds, which invalidation can't trigger.
    const queryClient = useQueryClient()
    const [refreshNonce, setRefreshNonce] = useState(0)
    const bumpRefresh = useCallback(() => {
        setRefreshNonce((n) => n + 1)
        queryClient.invalidateQueries()
    }, [queryClient])

    const openAddLiquidity = (pool?: V3PoolData) => {
        setAddLiquidityPool(pool ?? null)
        setIsAddLiquidityOpen(true)
    }
    const openRemoveLiquidity = (position: PositionWithTokens) => {
        setSelectedPosition(position)
        setIsRemoveLiquidityOpen(true)
    }
    const openCollectFees = (position: PositionWithTokens) => {
        setSelectedPosition(position)
        setIsCollectFeesOpen(true)
    }
    const openIncreaseLiquidity = (position: PositionWithTokens) => {
        setSelectedPosition(position)
        setIsIncreaseLiquidityOpen(true)
    }
    const openStakeDialog = (incentive: Incentive) => {
        setSelectedIncentive(incentive)
        setIsStakeDialogOpen(true)
    }
    const openUnstakeDialog = (stakedPosition: StakedPosition) => {
        setSelectedStakedPosition(stakedPosition)
        setIsUnstakeDialogOpen(true)
    }
    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-4">
                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'pools' | 'positions')}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <TabsList>
                                <TabsTrigger value="pools">Pools</TabsTrigger>
                                <TabsTrigger value="positions">My Positions</TabsTrigger>
                            </TabsList>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!isConnected) {
                                    setIsConnectModalOpen(true)
                                    return
                                }
                                openAddLiquidity()
                            }}
                        >
                            <Plus />
                            New Position
                        </Button>
                    </div>
                    <TabsContent value="pools" className="space-y-6">
                        <MiningFarms onStake={openStakeDialog} />
                        <PoolsList onAddLiquidity={openAddLiquidity} />
                    </TabsContent>
                    <TabsContent value="positions" className="space-y-6">
                        <PositionsList
                            onAddLiquidity={openAddLiquidity}
                            onCollectFees={openCollectFees}
                            onRemoveLiquidity={openRemoveLiquidity}
                            onIncreaseLiquidity={openIncreaseLiquidity}
                            onUnstake={openUnstakeDialog}
                            refreshNonce={refreshNonce}
                        />
                    </TabsContent>
                </Tabs>
                <AddLiquidityDialog
                    open={isAddLiquidityOpen}
                    initialPool={addLiquidityPool}
                    onClose={() => setIsAddLiquidityOpen(false)}
                    onSuccess={bumpRefresh}
                />
                <RemoveLiquidityDialog
                    open={isRemoveLiquidityOpen}
                    position={selectedPosition}
                    onClose={() => setIsRemoveLiquidityOpen(false)}
                    onSuccess={bumpRefresh}
                />
                <CollectFeesDialog
                    open={isCollectFeesOpen}
                    position={selectedPosition}
                    onClose={() => setIsCollectFeesOpen(false)}
                    onSuccess={bumpRefresh}
                />
                <IncreaseLiquidityDialog
                    open={isIncreaseLiquidityOpen}
                    position={selectedPosition}
                    onClose={() => setIsIncreaseLiquidityOpen(false)}
                    onSuccess={bumpRefresh}
                />
                <StakeDialog
                    open={isStakeDialogOpen}
                    incentive={selectedIncentive}
                    onClose={() => setIsStakeDialogOpen(false)}
                    onAddLiquidity={openAddLiquidity}
                    onSuccess={bumpRefresh}
                />
                <UnstakeDialog
                    open={isUnstakeDialogOpen}
                    stakedPosition={selectedStakedPosition}
                    onClose={() => setIsUnstakeDialogOpen(false)}
                    onSuccess={bumpRefresh}
                />
                <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
            </div>
        </div>
    )
}

export default function EarnPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen">Loading...</div>
            }
        >
            <EarnContent />
        </Suspense>
    )
}
