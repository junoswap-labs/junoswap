'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowUpDown, ArrowRight } from 'lucide-react'
import { RangeSelector } from './range-selector'
import { TokenSelect } from '@/components/swap/token-select'
import { useEarnStore, useRangeConfig } from '@/store/earn-store'
import { usePool } from '@/hooks/usePools'
import { useAddLiquidity } from '@/hooks/useLiquidity'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useUserPositions } from '@/hooks/useUserPositions'
import { getV3Config, FEE_TIERS } from '@/lib/dex-config'
import { getChainMetadata } from '@/lib/wagmi'
import { parseTokenAmount, formatBalance, formatTokenAmount } from '@/services/tokens'
import {
    tickToSqrtPriceX96,
    priceToSqrtPriceX96,
    sqrtPriceX96ToTick,
    calculateAmount1FromAmount0,
    calculateAmount0FromAmount1,
    nearestUsableTick,
    getTickSpacing,
    MIN_TICK,
    MAX_TICK,
} from '@/lib/liquidity-helpers'
import { useChainTokens } from '@/hooks/useChainTokens'
import type { AddLiquidityParams } from '@/types/earn'
import { toastError } from '@/lib/toast'
import { toast } from 'sonner'

const FEE_OPTIONS = [
    { value: FEE_TIERS.STABLE, label: '0.01%', description: 'Best for stable pairs' },
    { value: FEE_TIERS.LOW, label: '0.05%', description: 'Best for stable pairs' },
    { value: FEE_TIERS.MEDIUM, label: '0.3%', description: 'Best for most pairs' },
    { value: FEE_TIERS.HIGH, label: '1%', description: 'Best for exotic pairs' },
]

export function AddLiquidityDialog() {
    const { address } = useAccount()
    const chainId = useChainId()
    const router = useRouter()
    const { refetch: refetchPositions } = useUserPositions(address, chainId)
    const dexConfig = getV3Config(chainId)
    const { tokens: allTokens } = useChainTokens(chainId)

    const {
        isAddLiquidityOpen,
        closeAddLiquidity,
        token0,
        token1,
        fee,
        setToken0,
        setToken1,
        setFee,
        setRangeConfig,
    } = useEarnStore()
    const rangeConfig = useRangeConfig()
    const handledHashRef = useRef<string | null>(null)
    const [amount0, setAmount0] = useState('')
    const [amount1, setAmount1] = useState('')
    const [activeInput, setActiveInput] = useState<'token0' | 'token1' | null>(null)
    const [initialPrice, setInitialPrice] = useState('')
    const { pool, isLoading: isLoadingPool } = usePool(token0, token1, fee, chainId)
    const { balance: balance0 } = useTokenBalance({ token: token0, address })
    const { balance: balance1 } = useTokenBalance({ token: token1, address })
    const initialSqrtPriceX96 = useMemo(() => {
        if (!initialPrice || !token0 || !token1) return null
        const priceNum = parseFloat(initialPrice)
        if (isNaN(priceNum) || priceNum <= 0) return null
        return priceToSqrtPriceX96(initialPrice, token0.decimals, token1.decimals)
    }, [initialPrice, token0, token1])

    const derivedTick = useMemo(() => {
        if (!initialSqrtPriceX96) return null
        return sqrtPriceX96ToTick(initialSqrtPriceX96)
    }, [initialSqrtPriceX96])

    const mintParams = useMemo<AddLiquidityParams | null>(() => {
        if (!token0 || !token1 || !address) return null
        if (!amount0 && !amount1) return null
        if (rangeConfig.tickLower >= rangeConfig.tickUpper) return null

        const amount0Parsed = amount0 ? parseTokenAmount(amount0, token0.decimals) : 0n
        const amount1Parsed = amount1 ? parseTokenAmount(amount1, token1.decimals) : 0n

        if (pool) {
            return {
                token0,
                token1,
                fee,
                tickLower: rangeConfig.tickLower,
                tickUpper: rangeConfig.tickUpper,
                amount0Desired: amount0Parsed,
                amount1Desired: amount1Parsed,
                slippageTolerance: 100, // 1%
                deadline: Math.floor(Date.now() / 1000) + 20 * 60,
                recipient: address,
            }
        }

        // No pool: pool creation path requires initial price
        if (!initialSqrtPriceX96) return null

        return {
            token0,
            token1,
            fee,
            tickLower: rangeConfig.tickLower,
            tickUpper: rangeConfig.tickUpper,
            amount0Desired: amount0Parsed,
            amount1Desired: amount1Parsed,
            slippageTolerance: 100,
            deadline: Math.floor(Date.now() / 1000) + 20 * 60,
            recipient: address,
            createPool: true,
            initialSqrtPriceX96,
        }
    }, [token0, token1, amount0, amount1, fee, rangeConfig, address, pool, initialSqrtPriceX96])
    const {
        needsApproval: needsApproval0,
        approve: approve0,
        isApproving: isApproving0,
        isConfirming: isConfirming0,
    } = useTokenApproval({
        token: token0,
        owner: address,
        spender: dexConfig?.positionManager,
        amountToApprove: amount0 ? parseTokenAmount(amount0, token0?.decimals ?? 18) : 0n,
    })
    const {
        needsApproval: needsApproval1,
        approve: approve1,
        isApproving: isApproving1,
        isConfirming: isConfirming1,
    } = useTokenApproval({
        token: token1,
        owner: address,
        spender: dexConfig?.positionManager,
        amountToApprove: amount1 ? parseTokenAmount(amount1, token1?.decimals ?? 18) : 0n,
    })
    const needsApprovalCheck = useMemo(() => {
        return needsApproval0 || needsApproval1
    }, [needsApproval0, needsApproval1])
    const {
        mint,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        error,
        simulationError,
        hash,
    } = useAddLiquidity(mintParams, needsApprovalCheck)
    useEffect(() => {
        if (pool && rangeConfig.tickLower === 0 && rangeConfig.tickUpper === 0) {
            setRangeConfig({
                ...rangeConfig,
                tickLower: pool.tick - 1000,
                tickUpper: pool.tick + 1000,
            })
        }
    }, [pool, rangeConfig, setRangeConfig])

    // Set full range defaults when creating a pool
    useEffect(() => {
        if (
            !pool &&
            derivedTick !== null &&
            token0 &&
            token1 &&
            rangeConfig.tickLower === 0 &&
            rangeConfig.tickUpper === 0
        ) {
            const tickSpacing = getTickSpacing(fee)
            setRangeConfig({
                preset: 'full',
                tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
                tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
                priceLower: '0',
                priceUpper: '∞',
            })
        }
    }, [pool, derivedTick, fee, token0, token1, rangeConfig, setRangeConfig])

    // Auto-calculate dependent token amount based on active input (existing pools only)
    useEffect(() => {
        if (!token0 || !token1) return
        if (!pool) return
        const sqrtPriceX96 = pool.sqrtPriceX96
        if (!sqrtPriceX96) return
        if (rangeConfig.tickLower >= rangeConfig.tickUpper) return

        const sqrtPriceLowerX96 = tickToSqrtPriceX96(rangeConfig.tickLower)
        const sqrtPriceUpperX96 = tickToSqrtPriceX96(rangeConfig.tickUpper)

        if (activeInput === 'token0') {
            if (!amount0) {
                setAmount1('')
                return
            }
            const amount0Parsed = parseTokenAmount(amount0, token0.decimals)
            if (amount0Parsed > 0n) {
                const calculatedAmount1 = calculateAmount1FromAmount0(
                    sqrtPriceX96,
                    sqrtPriceLowerX96,
                    sqrtPriceUpperX96,
                    amount0Parsed
                )
                setAmount1(
                    calculatedAmount1 > 0n
                        ? formatTokenAmount(calculatedAmount1, token1.decimals)
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
            const amount1Parsed = parseTokenAmount(amount1, token1.decimals)
            if (amount1Parsed > 0n) {
                const calculatedAmount0 = calculateAmount0FromAmount1(
                    sqrtPriceX96,
                    sqrtPriceLowerX96,
                    sqrtPriceUpperX96,
                    amount1Parsed
                )
                setAmount0(
                    calculatedAmount0 > 0n
                        ? formatTokenAmount(calculatedAmount0, token0.decimals)
                        : ''
                )
            } else {
                setAmount0('')
            }
        }
    }, [
        activeInput,
        amount0,
        amount1,
        pool,
        token0,
        token1,
        rangeConfig.tickLower,
        rangeConfig.tickUpper,
    ])

    // Auto-derive initial price from amount ratio for new pools
    useEffect(() => {
        if (pool || !token0 || !token1) return
        const a0 = amount0 ? parseFloat(amount0) : 0
        const a1 = amount1 ? parseFloat(amount1) : 0
        if (a0 > 0 && a1 > 0) {
            const price = a1 / a0
            const roundedPrice = parseFloat(price.toPrecision(10))
            setInitialPrice(roundedPrice.toString())
        } else {
            setInitialPrice('')
        }
    }, [pool, token0, token1, amount0, amount1])

    useEffect(() => {
        if (isSuccess && hash && hash !== handledHashRef.current) {
            handledHashRef.current = hash
            const meta = getChainMetadata(chainId)
            const explorerUrl = meta?.explorer
                ? `${meta.explorer}/tx/${hash}`
                : `https://etherscan.io/tx/${hash}`
            toast.success('Position created successfully!', {
                action: {
                    label: 'View Transaction',
                    onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
                },
            })
            refetchPositions()
            closeAddLiquidity()
            setAmount0('')
            setAmount1('')
            setActiveInput(null)
            setInitialPrice('')
        }
    }, [isSuccess, hash, chainId, closeAddLiquidity, refetchPositions])
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
            mint()
        }
    }
    const getButtonText = () => {
        if (!address) return 'Connect Wallet'
        if (isApproving0) return `Approving ${token0?.symbol}...`
        if (isConfirming0) return `Confirming ${token0?.symbol} approval...`
        if (isApproving1) return `Approving ${token1?.symbol}...`
        if (isConfirming1) return `Confirming ${token1?.symbol} approval...`
        if (needsApproval0) return `Approve ${token0?.symbol}`
        if (needsApproval1) return `Approve ${token1?.symbol}`
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return 'Creating position...'
        if (!pool) return 'Create Pool & Add Liquidity'
        return 'Add Liquidity'
    }
    const isInsufficientBalance = (
        balance: bigint | null | undefined,
        amount: string,
        decimals: number
    ) => {
        if (!balance) return true
        if (!amount) return balance === 0n
        const parsed = parseTokenAmount(amount, decimals)
        return parsed > 0n && balance < parsed
    }

    const handleGoSwap = (outputAddress: string, inputAddress?: string) => {
        closeAddLiquidity()
        const params = new URLSearchParams()
        if (inputAddress) params.set('input', inputAddress)
        params.set('output', outputAddress)
        router.push(`/swap?${params.toString()}`)
    }

    const isButtonDisabled = () => {
        if (isLoading) return true
        if (!token0 || !token1) return true
        if (!amount0 && !amount1) return true
        if (rangeConfig.tickLower >= rangeConfig.tickUpper) return true
        if (!pool && !initialSqrtPriceX96) return true
        return false
    }

    const handleSwapTokens = () => {
        if (!token0 || !token1) return
        const prevToken0 = token0
        const prevAmount0 = amount0
        setToken0(token1)
        setToken1(prevToken0)
        setAmount0(amount1)
        setAmount1(prevAmount0)
        if (activeInput === 'token0') setActiveInput('token1')
        else if (activeInput === 'token1') setActiveInput('token0')
    }

    return (
        <Dialog open={isAddLiquidityOpen} onOpenChange={closeAddLiquidity}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] bg-card/95 backdrop-blur-md border-border/50 card-glow">
                <DialogHeader>
                    <DialogTitle className="text-lg">Add Liquidity</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)] pr-1">
                    {/* Pair & Fee Panel */}
                    <div className="rounded-2xl bg-muted/20 border border-border/30 p-4 space-y-4">
                        {/* Token Pair */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <TokenSelect
                                    token={token0}
                                    tokens={allTokens}
                                    onSelect={setToken0}
                                    className="w-full h-11 rounded-xl bg-muted/40 border-border/40 hover:bg-muted/60 justify-between pr-3"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleSwapTokens}
                                className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl bg-background/60 border border-border/30 hover:bg-background/80 hover:border-border/50 transition-all duration-150"
                            >
                                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <div className="flex-1">
                                <TokenSelect
                                    token={token1}
                                    tokens={allTokens}
                                    onSelect={setToken1}
                                    className="w-full h-11 rounded-xl bg-muted/40 border-border/40 hover:bg-muted/60 justify-between pr-3"
                                />
                            </div>
                        </div>

                        {/* Fee Tier */}
                        <div className="grid grid-cols-4 gap-2">
                            {FEE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFee(option.value)}
                                    className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl text-center transition-all duration-150 ${
                                        fee === option.value
                                            ? 'bg-foreground/8 ring-1 ring-foreground/15'
                                            : 'bg-background/40 hover:bg-background/60'
                                    }`}
                                >
                                    <span
                                        className={`text-xs font-semibold ${
                                            fee === option.value
                                                ? 'text-foreground'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {option.label}
                                    </span>
                                    <span className="text-[9px] leading-tight text-muted-foreground/60">
                                        {option.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Range Selector */}
                    {token0 && token1 && (pool || derivedTick !== null) && (
                        <>
                            <Separator />
                            <RangeSelector
                                currentTick={pool?.tick ?? derivedTick!}
                                tickSpacing={pool?.tickSpacing ?? getTickSpacing(fee)}
                                decimals0={token0.decimals}
                                decimals1={token1.decimals}
                                token0Symbol={token0.symbol}
                                token1Symbol={token1.symbol}
                                config={rangeConfig}
                                onChange={setRangeConfig}
                            />
                        </>
                    )}

                    {/* Token Amount Inputs */}
                    {token0 && token1 && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                {/* Token 0 */}
                                <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {token0.logo && (
                                                <img
                                                    src={token0.logo}
                                                    alt={token0.symbol}
                                                    className="h-5 w-5 rounded-full object-cover"
                                                />
                                            )}
                                            <span className="text-sm font-medium">
                                                {token0.symbol}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="text-[10px] font-semibold text-foreground hover:text-foreground/80 px-1.5 py-0.5 rounded bg-foreground/10 hover:bg-foreground/15 transition-colors"
                                            onClick={() => {
                                                if (balance0 && token0) {
                                                    setActiveInput('token0')
                                                    setAmount0(
                                                        formatTokenAmount(balance0, token0.decimals)
                                                    )
                                                }
                                            }}
                                        >
                                            MAX
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="any"
                                        value={amount0}
                                        onChange={(e) => {
                                            setActiveInput('token0')
                                            setAmount0(e.target.value)
                                        }}
                                        placeholder="0.0"
                                        className="w-full bg-transparent text-xl font-semibold placeholder:text-muted-foreground/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-muted-foreground">
                                            Balance:{' '}
                                            {balance0
                                                ? formatBalance(balance0, token0.decimals)
                                                : '0'}
                                        </p>
                                        {isInsufficientBalance(
                                            balance0,
                                            amount0,
                                            token0.decimals
                                        ) && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleGoSwap(token0.address, token1?.address)
                                                }
                                                className="flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                                            >
                                                Go Swap
                                                <ArrowRight className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Token 1 */}
                                <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {token1.logo && (
                                                <img
                                                    src={token1.logo}
                                                    alt={token1.symbol}
                                                    className="h-5 w-5 rounded-full object-cover"
                                                />
                                            )}
                                            <span className="text-sm font-medium">
                                                {token1.symbol}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="text-[10px] font-semibold text-foreground hover:text-foreground/80 px-1.5 py-0.5 rounded bg-foreground/10 hover:bg-foreground/15 transition-colors"
                                            onClick={() => {
                                                if (balance1 && token1) {
                                                    setActiveInput('token1')
                                                    setAmount1(
                                                        formatTokenAmount(balance1, token1.decimals)
                                                    )
                                                }
                                            }}
                                        >
                                            MAX
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        step="any"
                                        value={amount1}
                                        onChange={(e) => {
                                            setActiveInput('token1')
                                            setAmount1(e.target.value)
                                        }}
                                        placeholder="0.0"
                                        className="w-full bg-transparent text-xl font-semibold placeholder:text-muted-foreground/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-muted-foreground">
                                            Balance:{' '}
                                            {balance1
                                                ? formatBalance(balance1, token1.decimals)
                                                : '0'}
                                        </p>
                                        {isInsufficientBalance(
                                            balance1,
                                            amount1,
                                            token1.decimals
                                        ) && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleGoSwap(token1.address, token0?.address)
                                                }
                                                className="flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                                            >
                                                Go Swap
                                                <ArrowRight className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Initial Price (new pool only) - auto-derived from amounts */}
                    {token0 && token1 && !pool && !isLoadingPool && (
                        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">Initial Price</span>
                                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium">
                                    New Pool
                                </span>
                            </div>
                            {initialPrice ? (
                                <p className="text-lg font-semibold">
                                    {initialPrice} {token1.symbol} per 1 {token0.symbol}
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Enter both token amounts to set the initial price
                                </p>
                            )}
                        </div>
                    )}

                    {/* Submit */}
                    <Button
                        className="w-full"
                        size="lg"
                        onClick={handleSubmit}
                        disabled={isButtonDisabled()}
                        isLoading={isLoading}
                        loadingText={getButtonText()}
                    >
                        {getButtonText()}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
