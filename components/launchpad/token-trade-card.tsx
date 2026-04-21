'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { parseUnits, formatEther, parseEther } from 'viem'
import type { Address } from 'viem'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useBondingCurveBuy } from '@/hooks/useBondingCurveBuy'
import { useBondingCurveSell } from '@/hooks/useBondingCurveSell'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { PUMP_CORE_NATIVE_ADDRESS, PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { isValidNumberInput, cn } from '@/lib/utils'
import { formatKub, formatTokenAmount } from '@/services/launchpad'
import { toastSuccess, toastError } from '@/lib/toast'
import { getChainMetadata } from '@/lib/wagmi'
import { ConnectModal } from '@/components/web3/connect-modal'
import { SettingsDialog } from '@/components/swap/settings-dialog'
import { useLaunchpadStore } from '@/store/launchpad-store'

interface TokenTradeCardProps {
    tokenAddr: Address
    tokenSymbol?: string
    tokenDecimals?: number
    isGraduated: boolean
}

function PercentButtons({ onSelect }: { onSelect: (pct: number) => void }) {
    const presets = [
        { label: '25%', value: 25 },
        { label: '50%', value: 50 },
        { label: '75%', value: 75 },
        { label: 'MAX', value: 100 },
    ]
    return (
        <div className="flex gap-1.5">
            {presets.map((p) => (
                <button
                    key={p.value}
                    onClick={() => onSelect(p.value)}
                    className="flex-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors border border-transparent hover:border-border hover:bg-accent hover:text-foreground"
                >
                    {p.label}
                </button>
            ))}
        </div>
    )
}

export function TokenTradeCard({
    tokenAddr,
    tokenSymbol = 'TOKEN',
    tokenDecimals = 18,
    isGraduated: _initialIsGraduated,
}: TokenTradeCardProps) {
    const { address, isConnected } = useAccount()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
    const [buyAmount, setBuyAmount] = useState('')
    const [sellAmount, setSellAmount] = useState('')
    const { settings, setSlippageBps } = useLaunchpadStore()

    const {
        nativeReserve,
        tokenReserve,
        isGraduated,
        virtualAmount,
        refetch: refetchReserves,
    } = useTokenReserves({ tokenAddr })

    // User's native KUB balance
    const { data: nativeBalance, refetch: refetchNative } = useBalance({
        address,
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    // User's token balance
    const { data: tokenBalance, refetch: refetchTokens } = useReadContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address || '0x0'],
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: { enabled: !!address },
    })

    // Parse amounts
    const buyAmountWei = useMemo(() => {
        if (!buyAmount || !isValidNumberInput(buyAmount)) return 0n
        try {
            return parseEther(buyAmount)
        } catch {
            return 0n
        }
    }, [buyAmount])

    const sellAmountWei = useMemo(() => {
        if (!sellAmount || !isValidNumberInput(sellAmount)) return 0n
        try {
            return parseUnits(sellAmount, tokenDecimals)
        } catch {
            return 0n
        }
    }, [sellAmount, tokenDecimals])

    // Buy hook
    const {
        buy,
        expectedOut: buyExpectedOut,
        minTokenOut,
        isPreparing: isBuyPreparing,
        isExecuting: isBuyExecuting,
        isConfirming: isBuyConfirming,
        isSuccess: isBuySuccess,
        isError: isBuyError,
        error: buyError,
        hash: buyHash,
    } = useBondingCurveBuy({
        tokenAddr,
        nativeAmount: buyAmountWei,
        nativeReserve,
        tokenReserve,
        virtualAmount,
        enabled: !isGraduated,
    })

    // Sell hook
    const {
        sell,
        expectedOut: sellExpectedOut,
        minNativeOut,
        isPreparing: isSellPreparing,
        isExecuting: isSellExecuting,
        isConfirming: isSellConfirming,
        isSuccess: isSellSuccess,
        isError: isSellError,
        error: sellError,
        hash: sellHash,
    } = useBondingCurveSell({
        tokenAddr,
        tokenAmount: sellAmountWei,
        nativeReserve,
        tokenReserve,
        virtualAmount,
        enabled: !isGraduated,
    })

    // Token approval for selling
    const {
        needsApproval: needsSellApproval,
        isApproving: isApprovingSell,
        isConfirming: isConfirmingApproval,
        approve: approveSell,
    } = useTokenApproval({
        token: {
            address: tokenAddr,
            symbol: tokenSymbol,
            name: '',
            decimals: tokenDecimals,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        },
        owner: address,
        spender: PUMP_CORE_NATIVE_ADDRESS,
        amountToApprove: sellAmountWei,
    })

    // Handle buy success
    useEffect(() => {
        if (!isBuySuccess || !buyHash) return
        const metadata = getChainMetadata(PUMP_CORE_NATIVE_CHAIN_ID)
        toastSuccess('Buy successful!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${buyHash}`, '_blank'),
            },
        })
        setBuyAmount('')
        refetchReserves()
        refetchNative()
        refetchTokens()
    }, [isBuySuccess, buyHash])

    // Handle sell success
    useEffect(() => {
        if (!isSellSuccess || !sellHash) return
        const metadata = getChainMetadata(PUMP_CORE_NATIVE_CHAIN_ID)
        toastSuccess('Sell successful!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${sellHash}`, '_blank'),
            },
        })
        setSellAmount('')
        refetchReserves()
        refetchNative()
        refetchTokens()
    }, [isSellSuccess, sellHash])

    // Handle errors
    useEffect(() => {
        if (isBuyError && buyError) toastError(buyError, 'Buy failed')
    }, [isBuyError, buyError])

    useEffect(() => {
        if (isSellError && sellError) toastError(sellError, 'Sell failed')
    }, [isSellError, sellError])

    const handleBuyInputChange = (value: string) => {
        if (isValidNumberInput(value)) setBuyAmount(value)
    }

    const handleSellInputChange = (value: string) => {
        if (isValidNumberInput(value)) setSellAmount(value)
    }

    const handleBuyPercent = (pct: number) => {
        if (!nativeBalance?.value) return
        const amount = (nativeBalance.value * BigInt(pct)) / 100n
        setBuyAmount(formatEther(amount))
    }

    const handleSellPercent = (pct: number) => {
        if (!tokenBalance) return
        const balance = tokenBalance as bigint
        const amount = (balance * BigInt(pct)) / 100n
        setSellAmount(formatEther(amount))
    }

    const handleBuy = () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        buy()
    }

    const handleSell = () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        if (needsSellApproval) {
            approveSell()
            return
        }
        sell()
    }

    if (isGraduated) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="rounded-lg bg-green-500/10 p-6 text-center">
                        <p className="text-lg font-semibold text-green-500">Token Graduated!</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            This token is now trading on Uniswap V3
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardContent className="p-6">
                    <Tabs
                        value={activeTab}
                        onValueChange={(v) => setActiveTab(v as 'buy' | 'sell')}
                    >
                        <TabsList className="relative grid w-full grid-cols-2 rounded-lg bg-muted/40 p-1">
                            <TabsTrigger
                                value="buy"
                                className="relative z-10 flex items-center justify-center rounded-md py-2 text-sm font-medium tracking-wide uppercase transition-all duration-200 data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-emerald-500/20"
                            >
                                Buy
                            </TabsTrigger>
                            <TabsTrigger
                                value="sell"
                                className="relative z-10 flex items-center justify-center rounded-md py-2 text-sm font-medium tracking-wide uppercase transition-all duration-200 data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-rose-500/20"
                            >
                                Sell
                            </TabsTrigger>
                        </TabsList>

                        {/* Slippage settings */}
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Slippage: {(settings.slippageBps / 100).toFixed(1)}%</span>
                            <SettingsDialog
                                currentSlippage={settings.slippageBps / 100}
                                currentDeadlineMinutes={20}
                                onSave={(slippage) => setSlippageBps(Math.round(slippage * 100))}
                            />
                        </div>

                        {/* Buy Tab */}
                        <TabsContent value="buy" className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <Label>Amount (KUB)</Label>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            if (nativeBalance?.value) {
                                                setBuyAmount(formatEther(nativeBalance.value))
                                            }
                                        }}
                                    >
                                        Balance:{' '}
                                        {nativeBalance ? formatKub(nativeBalance.value) : '0'} KUB
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        placeholder="0.0"
                                        value={buyAmount}
                                        onChange={(e) => handleBuyInputChange(e.target.value)}
                                        className="h-14 bg-muted/50 border-0 text-lg font-semibold pr-16 focus-visible:ring-1 focus-visible:ring-primary/30"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                        KUB
                                    </div>
                                </div>
                                <PercentButtons onSelect={handleBuyPercent} />
                            </div>

                            {buyAmountWei > 0n && (
                                <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            You receive (est.)
                                        </span>
                                        <span className="font-medium">
                                            {formatTokenAmount(buyExpectedOut)} {tokenSymbol}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Min received</span>
                                        <span className="font-medium">
                                            {formatTokenAmount(minTokenOut)} {tokenSymbol}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Fee</span>
                                        <span className="font-medium">1%</span>
                                    </div>
                                </div>
                            )}

                            <Button
                                size="xl"
                                className={cn(
                                    'w-full bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
                                    (isBuyPreparing ||
                                        isBuyExecuting ||
                                        isBuyConfirming ||
                                        buyAmountWei === 0n) &&
                                        'opacity-50 cursor-not-allowed'
                                )}
                                onClick={handleBuy}
                                disabled={
                                    isBuyPreparing ||
                                    isBuyExecuting ||
                                    isBuyConfirming ||
                                    buyAmountWei === 0n
                                }
                            >
                                {isBuyExecuting
                                    ? 'Buying...'
                                    : isBuyConfirming
                                      ? 'Confirming...'
                                      : 'Buy'}
                            </Button>
                        </TabsContent>

                        {/* Sell Tab */}
                        <TabsContent value="sell" className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <Label>Amount ({tokenSymbol})</Label>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            if (tokenBalance) {
                                                setSellAmount(formatEther(tokenBalance as bigint))
                                            }
                                        }}
                                    >
                                        Balance:{' '}
                                        {tokenBalance
                                            ? formatTokenAmount(tokenBalance as bigint)
                                            : '0'}{' '}
                                        {tokenSymbol}
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        placeholder="0.0"
                                        value={sellAmount}
                                        onChange={(e) => handleSellInputChange(e.target.value)}
                                        className="h-14 bg-muted/50 border-0 text-lg font-semibold pr-20 focus-visible:ring-1 focus-visible:ring-primary/30"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                        {tokenSymbol}
                                    </div>
                                </div>
                                <PercentButtons onSelect={handleSellPercent} />
                            </div>

                            {sellAmountWei > 0n && (
                                <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            You receive (est.)
                                        </span>
                                        <span className="font-medium">
                                            {formatKub(sellExpectedOut)} KUB
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Min received</span>
                                        <span className="font-medium">
                                            {formatKub(minNativeOut)} KUB
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Fee</span>
                                        <span className="font-medium">1%</span>
                                    </div>
                                </div>
                            )}

                            <Button
                                size="xl"
                                className={cn(
                                    'w-full bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
                                    (isSellPreparing ||
                                        isSellExecuting ||
                                        isSellConfirming ||
                                        isApprovingSell ||
                                        isConfirmingApproval ||
                                        sellAmountWei === 0n) &&
                                        'opacity-50 cursor-not-allowed'
                                )}
                                onClick={handleSell}
                                disabled={
                                    isSellPreparing ||
                                    isSellExecuting ||
                                    isSellConfirming ||
                                    isApprovingSell ||
                                    isConfirmingApproval ||
                                    sellAmountWei === 0n
                                }
                            >
                                {isApprovingSell || isConfirmingApproval
                                    ? 'Approving...'
                                    : needsSellApproval
                                      ? `Approve ${tokenSymbol}`
                                      : isSellExecuting
                                        ? 'Selling...'
                                        : isSellConfirming
                                          ? 'Confirming...'
                                          : 'Sell'}
                            </Button>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </>
    )
}
