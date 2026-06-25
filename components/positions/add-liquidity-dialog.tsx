'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { Token } from '@/types/tokens'
import { useAccount, useChainId } from 'wagmi'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TokenIcon } from '@/components/ui/token-icon'
import { ArrowUpDown, ArrowRight } from 'lucide-react'
import { RangeSelector } from './range-selector'
import { TokenSelect } from '@/components/swap/token-select'
import { usePool } from '@/hooks/usePools'
import { useAddLiquidity } from '@/hooks/useLiquidity'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { useTokenBalance } from '@/hooks/useTokenBalance'
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
    getPresetRange,
    MIN_TICK,
    MAX_TICK,
} from '@/lib/liquidity-helpers'
import { useChainTokens } from '@/hooks/useChainTokens'
import type { AddLiquidityParams, RangeConfig, V3PoolData } from '@/types/earn'
import { DEFAULT_RANGE_CONFIG } from '@/types/earn'
import { toastError } from '@/lib/toast'
import { toast } from 'sonner'

const FEE_OPTIONS = [
    { value: FEE_TIERS.STABLE, label: '0.01%', description: 'Best for stable pairs' },
    { value: FEE_TIERS.LOW, label: '0.05%', description: 'Best for stable pairs' },
    { value: FEE_TIERS.MEDIUM, label: '0.3%', description: 'Best for most pairs' },
    { value: FEE_TIERS.HIGH, label: '1%', description: 'Best for exotic pairs' },
]

interface AddLiquidityDialogProps {
    open: boolean
    initialPool: V3PoolData | null
    onClose: () => void
    onSuccess?: () => void
}

export function AddLiquidityDialog({
    open,
    initialPool,
    onClose,
    onSuccess,
}: AddLiquidityDialogProps) {
    const { address } = useAccount()
    const chainId = useChainId()
    const router = useRouter()
    const dexConfig = getV3Config(chainId)
    const { tokens: allTokens } = useChainTokens(chainId)

    const [token0, setToken0] = useState<Token | null>(null)
    const [token1, setToken1] = useState<Token | null>(null)
    const [fee, setFee] = useState(3000)
    const [rangeConfig, setRangeConfig] = useState<RangeConfig>(DEFAULT_RANGE_CONFIG)
    const handledHashRef = useRef<string | null>(null)
    const [amount0, setAmount0] = useState('')
    const [amount1, setAmount1] = useState('')
    const [activeInput, setActiveInput] = useState<'token0' | 'token1' | null>(null)
    const [initialPrice, setInitialPrice] = useState('')

    // Seed the form when the dialog opens: from initialPool if provided (opened for a specific
    // pool), otherwise a clean slate. The usePool + range-reset effects below then populate the
    // range once pool data loads.
    const wasOpenRef = useRef(false)
    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setToken0(initialPool?.token0 ?? null)
            setToken1(initialPool?.token1 ?? null)
            setFee(initialPool?.fee ?? 3000)
            setRangeConfig(DEFAULT_RANGE_CONFIG)
            setAmount0('')
            setAmount1('')
            setActiveInput(null)
            setInitialPrice('')
        }
        wasOpenRef.current = open
    }, [open, initialPool])
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
    // Reset range when pool changes (or pool loads for first time)
    // Remove the tickLower===0 guard so stale persisted rangeConfig is always overwritten.
    useEffect(() => {
        if (!pool) return
        const tickSpacing = pool.tickSpacing
        setRangeConfig({
            preset: 'common',
            ...getPresetRange(pool.tick, tickSpacing, 'common'),
            priceLower: '',
            priceUpper: '',
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pool?.address, pool?.fee])

    // Set full range defaults when creating a new pool (no existing pool)
    useEffect(() => {
        if (!pool && derivedTick !== null && token0 && token1) {
            const tickSpacing = getTickSpacing(fee)
            setRangeConfig({
                preset: 'full',
                tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
                tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
                priceLower: '0',
                priceUpper: '∞',
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pool, derivedTick, fee, token0?.address, token1?.address])

    // Auto-calculate dependent token amount based on active input (existing pools only)
    useEffect(() => {
        if (!token0 || !token1) return
        if (!pool) return
        const sqrtPriceX96 = pool.sqrtPriceX96
        if (!sqrtPriceX96) return
        if (rangeConfig.tickLower >= rangeConfig.tickUpper) return

        const sqrtPriceLowerX96 = tickToSqrtPriceX96(rangeConfig.tickLower)
        const sqrtPriceUpperX96 = tickToSqrtPriceX96(rangeConfig.tickUpper)

        // pool.sqrtPriceX96 is in pool's sorted-address coordinate (pool.token0 < pool.token1).
        // If store.token0 != pool.token0, the user's token0/token1 are reversed vs the pool.
        // In that case swap the calculate functions so amounts stay in user's token order.
        const isPoolReversed = token0.address.toLowerCase() !== pool.token0.address.toLowerCase()

        if (activeInput === 'token0') {
            if (!amount0) {
                setAmount1('')
                return
            }
            const amount0Parsed = parseTokenAmount(amount0, token0.decimals)
            if (amount0Parsed > 0n) {
                const calculated = isPoolReversed
                    ? calculateAmount0FromAmount1(
                          sqrtPriceX96,
                          sqrtPriceLowerX96,
                          sqrtPriceUpperX96,
                          amount0Parsed
                      )
                    : calculateAmount1FromAmount0(
                          sqrtPriceX96,
                          sqrtPriceLowerX96,
                          sqrtPriceUpperX96,
                          amount0Parsed
                      )
                setAmount1(calculated > 0n ? formatTokenAmount(calculated, token1.decimals) : '')
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
                const calculated = isPoolReversed
                    ? calculateAmount1FromAmount0(
                          sqrtPriceX96,
                          sqrtPriceLowerX96,
                          sqrtPriceUpperX96,
                          amount1Parsed
                      )
                    : calculateAmount0FromAmount1(
                          sqrtPriceX96,
                          sqrtPriceLowerX96,
                          sqrtPriceUpperX96,
                          amount1Parsed
                      )
                setAmount0(calculated > 0n ? formatTokenAmount(calculated, token0.decimals) : '')
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
            onSuccess?.()
            onClose()
            setAmount0('')
            setAmount1('')
            setActiveInput(null)
            setInitialPrice('')
        }
    }, [isSuccess, hash, chainId, onClose, onSuccess])
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
        onClose()
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
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] bg-card/95 backdrop-blur-md border-border/50 card-glow">
                <DialogHeader>
                    <DialogTitle className="text-lg">Add Liquidity</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)] pr-1">
                    <div className="rounded-2xl bg-muted/20 border border-border/30 p-4 space-y-4">
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

                    {token0 && token1 && (pool || derivedTick !== null) && (
                        <>
                            <Separator />
                            <RangeSelector
                                currentTick={(() => {
                                    const rawTick = pool?.tick ?? derivedTick!
                                    // Pool stores price as token1/token0 by sorted address order.
                                    // If store.token0 != pool.token0 (reversed), negate the tick
                                    // so the price displays correctly in the user's chosen direction.
                                    const isPoolReversed =
                                        pool &&
                                        token0.address.toLowerCase() !==
                                            pool.token0.address.toLowerCase()
                                    return isPoolReversed ? -rawTick : rawTick
                                })()}
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

                    {token0 && token1 && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TokenIcon
                                                src={token0.logo}
                                                symbol={token0.symbol}
                                                size="xs"
                                            />
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

                                <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TokenIcon
                                                src={token1.logo}
                                                symbol={token1.symbol}
                                                size="xs"
                                            />
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
