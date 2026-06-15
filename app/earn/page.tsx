'use client'

import { Suspense, useState } from 'react'
import { useAccount } from 'wagmi'
import { Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PoolsList } from '@/components/positions/pools'
import { PositionsList } from '@/components/positions/positions-list'
import { AddLiquidityDialog } from '@/components/positions/add-liquidity-dialog'
import { RemoveLiquidityDialog } from '@/components/positions/remove-liquidity-dialog'
import { CollectFeesDialog } from '@/components/positions/collect-fees-dialog'
import { PositionDetailsModal } from '@/components/positions/position-details-modal'
import { IncreaseLiquidityDialog } from '@/components/positions/increase-liquidity-dialog'
import { MiningFarms, StakedPositions, StakeDialog, UnstakeDialog } from '@/components/mining'
import { useEarnStore, useActiveTab } from '@/store/earn-store'
import { ConnectModal } from '@/components/web3/connect-modal'

function EarnContent() {
    const { isConnected } = useAccount()
    const activeTab = useActiveTab()
    const { setActiveTab, openAddLiquidity } = useEarnStore()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
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
                        <MiningFarms />
                        <PoolsList />
                    </TabsContent>
                    <TabsContent value="positions" className="space-y-6">
                        <PositionsList />
                        <StakedPositions />
                    </TabsContent>
                </Tabs>
                <AddLiquidityDialog />
                <RemoveLiquidityDialog />
                <CollectFeesDialog />
                <PositionDetailsModal />
                <IncreaseLiquidityDialog />
                <StakeDialog />
                <UnstakeDialog />
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
