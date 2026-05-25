'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useEarnStore } from '@/store/earn-store'
import { useIncreaseLiquidity } from '@/hooks/useLiquidity'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useUserPositions } from '@/hooks/useUserPositions'
import { usePool } from '@/hooks/usePools'
import { getV3Config } from '@/lib/dex-config'
import { getChainMetadata } from '@/lib/wagmi'
import { parseTokenAmount, formatBalance, formatTokenAmount } from '@/services/tokens'
import {
    tickToSqrtPriceX96,
    calculateAmount1FromAmount0,
    calculateAmount0FromAmount1,
    tickToPrice,
    isInRange,
} from '@/lib/liquidity-helpers'
import { toastError } from '@/lib/toast'
import { toast } from 'sonner'

export function IncreaseLiquidityDialog() {
    const { address } = useAccount()
    const chainId = useChainId()
    const { refetch: refetchPositions } = useUserPositions(address, chainId)
    const dexConfig = getV3Config(chainId)
    const { isIncreaseLiquidityOpen, closeIncreaseLiquidity, selectedPosition } = useEarnStore()
    const [amount0, setAmount0] = useState('')
    const [amount1, setAmount1] = useState('')
    const [activeInput, setActiveInput] = useState<'token0' | 'token1' | null>(null)
    const handledHashRef = useRef<string | null>(null)
    const { pool } = usePool(
        selectedPosition?.token0Info ?? null,
        selectedPosition?.token1Info ?? null,
        selectedPosition?.fee ?? 0,
        chainId
    )
    const { balance: balance0 } = useTokenBalance({
        token: selectedPosition?.token0Info ?? null,
        address,
    })
    const { balance: balance1 } = useTokenBalance({
        token: selectedPosition?.token1Info ?? null,
        address,
    })
    const amount0Parsed =
        amount0 && selectedPosition
            ? parseTokenAmount(amount0, selectedPosition.token0Info.decimals)
            : 0n
    const amount1Parsed =
        amount1 && selectedPosition
            ? parseTokenAmount(amount1, selectedPosition.token1Info.decimals)
            : 0n
    const {
        needsApproval: needsApproval0,
        approve: approve0,
        isApproving: isApproving0,
        isConfirming: isConfirming0,
    } = useTokenApproval({
        token: selectedPosition?.token0Info ?? null,
        owner: address,
        spender: dexConfig?.positionManager,
        amountToApprove: amount0Parsed,
    })
    const {
        needsApproval: needsApproval1,
        approve: approve1,
        isApproving: isApproving1,
        isConfirming: isConfirming1,
    } = useTokenApproval({
        token: selectedPosition?.token1Info ?? null,
        owner: address,
        spender: dexConfig?.positionManager,
        amountToApprove: amount1Parsed,
    })
    const needsApprovalCheck = needsApproval0 || needsApproval1
    const {
        increase,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        error,
        simulationError,
        hash,
    } = useIncreaseLiquidity(
        selectedPosition?.tokenId,
        amount0Parsed,
        amount1Parsed,
        selectedPosition ?? null,
        50, // 0.5% slippage
        20, // 20 minutes deadline
        needsApprovalCheck // skip simulation during approval
    )
    useEffect(() => {
        if (!pool || !selectedPosition) return
        const sqrtPriceX96 = pool.sqrtPriceX96
        const sqrtPriceLowerX96 = tickToSqrtPriceX96(selectedPosition.tickLower)
        const sqrtPriceUpperX96 = tickToSqrtPriceX96(selectedPosition.tickUpper)
        if (activeInput === 'token0') {
            if (!amount0) {
                setAmount1('')
                return
            }
            if (amount0Parsed > 0n) {
                const calculatedAmount1 = calculateAmount1FromAmount0(
                    sqrtPriceX96,
                    sqrtPriceLowerX96,
                    sqrtPriceUpperX96,
                    amount0Parsed
                )
                setAmount1(
                    calculatedAmount1 > 0n
                        ? formatTokenAmount(calculatedAmount1, selectedPosition.token1Info.decimals)
                        : ''
                )
            } else {
                setAmount1('')
            }
        } else if (activeInput === 'token1') {
            if (!amount1) {
                setAmount0('')
                return
            }
            if (amount1Parsed > 0n) {
                const calculatedAmount0 = calculateAmount0FromAmount1(
                    sqrtPriceX96,
                    sqrtPriceLowerX96,
                    sqrtPriceUpperX96,
                    amount1Parsed
                )
                setAmount0(
                    calculatedAmount0 > 0n
                        ? formatTokenAmount(calculatedAmount0, selectedPosition.token0Info.decimals)
                        : ''
                )
            } else {
                setAmount0('')
            }
        }
    }, [activeInput, amount0, amount1, pool, selectedPosition, amount0Parsed, amount1Parsed])
    useEffect(() => {
        if (isSuccess && hash && hash !== handledHashRef.current) {
            handledHashRef.current = hash
            const meta = getChainMetadata(chainId)
            const explorerUrl = meta?.explorer
                ? `${meta.explorer}/tx/${hash}`
                : `https://etherscan.io/tx/${hash}`
            toast.success('Liquidity added successfully!', {
                action: {
                    label: 'View Transaction',
                    onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
                },
            })
            refetchPositions()
            closeIncreaseLiquidity()
            setAmount0('')
            setAmount1('')
            setActiveInput(null)
        }
    }, [isSuccess, hash, chainId, closeIncreaseLiquidity, refetchPositions])
    useEffect(() => {
        if (error) {
            toastError(error)
        }
    }, [error])
    useEffect(() => {
        if (simulationError) {
            toastError(`Simulation failed: ${simulationError.message}`)
        }
    }, [simulationError])
    const isLoading =
        isPreparing ||
        isExecuting ||
        isConfirming ||
        isApproving0 ||
        isApproving1 ||
        isConfirming0 ||
        isConfirming1
    const handleSubmit = () => {
        if (needsApproval0) {
            approve0()
        } else if (needsApproval1) {
            approve1()
        } else {
            increase()
        }
    }
    const getButtonText = () => {
        if (isApproving0) return `Approving ${selectedPosition?.token0Info.symbol}...`
        if (isConfirming0) return `Confirming ${selectedPosition?.token0Info.symbol} approval...`
        if (isApproving1) return `Approving ${selectedPosition?.token1Info.symbol}...`
        if (isConfirming1) return `Confirming ${selectedPosition?.token1Info.symbol} approval...`
        if (needsApproval0) return `Approve ${selectedPosition?.token0Info.symbol}`
        if (needsApproval1) return `Approve ${selectedPosition?.token1Info.symbol}`
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return 'Adding liquidity...'
        return 'Add Liquidity'
    }
    const isButtonDisabled = () => {
        if (isLoading) return true
        if (!selectedPosition) return true
        if (!amount0 && !amount1) return true
        if (!pool) return true
        return false
    }
    if (!selectedPosition) return null
    const priceLower = tickToPrice(
        selectedPosition.tickLower,
        selectedPosition.token0Info.decimals,
        selectedPosition.token1Info.decimals
    )
    const priceUpper = tickToPrice(
        selectedPosition.tickUpper,
        selectedPosition.token0Info.decimals,
        selectedPosition.token1Info.decimals
    )
    const inRange = pool
        ? isInRange(pool.tick, selectedPosition.tickLower, selectedPosition.tickUpper)
        : false
    return (
        <Dialog open={isIncreaseLiquidityOpen} onOpenChange={closeIncreaseLiquidity}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add Liquidity</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    <div className="text-center">
                        <div className="text-lg font-medium">
                            {selectedPosition.token0Info.symbol} /{' '}
                            {selectedPosition.token1Info.symbol}
                        </div>
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <span>Position #{selectedPosition.tokenId.toString()}</span>
                            {inRange ? (
                                <span className="text-green-600">• In Range</span>
                            ) : (
                                <span>• Out of Range</span>
                            )}
                        </div>
                    </div>
                    <Card>
                        <CardContent className="p-4 space-y-3">
                            <div className="text-sm text-muted-foreground">Price Range</div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Min</div>
                                    <div className="font-medium">{priceLower}</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Current</div>
                                    <div className="font-medium">
                                        {pool
                                            ? tickToPrice(
                                                  pool.tick,
                                                  selectedPosition.token0Info.decimals,
                                                  selectedPosition.token1Info.decimals
                                              )
                                            : '-'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Max</div>
                                    <div className="font-medium">{priceUpper}</div>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground text-center">
                                {selectedPosition.token1Info.symbol} per{' '}
                                {selectedPosition.token0Info.symbol}
                            </div>
                            <div className="h-2 bg-muted rounded-full relative overflow-hidden">
                                {(() => {
                                    const tickLower = selectedPosition.tickLower
                                    const tickUpper = selectedPosition.tickUpper
                                    const curTick = pool?.tick ?? tickLower
                                    const tickRange = tickUpper - tickLower
                                    if (tickRange <= 0) return null
                                    const normalizedCurrent = (curTick - tickLower) / tickRange
                                    const padding = 0.1
                                    const trackMin = -padding
                                    const trackMax = 1 + padding
                                    const trackSpan = trackMax - trackMin
                                    const rangeLeftPct = ((0 - trackMin) / trackSpan) * 100
                                    const rangeRightPct = ((1 - trackMin) / trackSpan) * 100
                                    const markerPct = Math.max(
                                        2,
                                        Math.min(
                                            98,
                                            ((normalizedCurrent - trackMin) / trackSpan) * 100
                                        )
                                    )
                                    return (
                                        <>
                                            <div
                                                className={`absolute h-full rounded-full transition-colors ${
                                                    inRange
                                                        ? 'bg-green-600'
                                                        : 'bg-muted-foreground/30'
                                                }`}
                                                style={{
                                                    left: `${rangeLeftPct}%`,
                                                    right: `${100 - rangeRightPct}%`,
                                                }}
                                            />
                                            <div
                                                className="absolute w-1 h-4 bg-foreground rounded -top-1 z-10"
                                                style={{
                                                    left: `${markerPct}%`,
                                                    transform: 'translateX(-50%)',
                                                }}
                                            />
                                        </>
                                    )
                                })()}
                            </div>
                        </CardContent>
                    </Card>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label>{selectedPosition.token0Info.symbol}</Label>
                                <span className="text-sm text-muted-foreground">
                                    Balance:{' '}
                                    {balance0
                                        ? formatBalance(
                                              balance0,
                                              selectedPosition.token0Info.decimals
                                          )
                                        : '0'}
                                </span>
                            </div>
                            <Input
                                type="number"
                                step="any"
                                value={amount0}
                                onChange={(e) => {
                                    setActiveInput('token0')
                                    setAmount0(e.target.value)
                                }}
                                placeholder="0.0"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label>{selectedPosition.token1Info.symbol}</Label>
                                <span className="text-sm text-muted-foreground">
                                    Balance:{' '}
                                    {balance1
                                        ? formatBalance(
                                              balance1,
                                              selectedPosition.token1Info.decimals
                                          )
                                        : '0'}
                                </span>
                            </div>
                            <Input
                                type="number"
                                step="any"
                                value={amount1}
                                onChange={(e) => {
                                    setActiveInput('token1')
                                    setAmount1(e.target.value)
                                }}
                                placeholder="0.0"
                            />
                        </div>
                    </div>
                    <Button
                        className="w-full"
                        size="lg"
                        onClick={handleSubmit}
                        disabled={isButtonDisabled()}
                    >
                        {getButtonText()}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
