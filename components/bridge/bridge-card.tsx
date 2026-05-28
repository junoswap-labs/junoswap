'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { parseUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useBridgeStore } from '@/store/bridge-store'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useBridgeQuote } from '@/hooks/useBridgeQuote'
import { useBridgeExecution } from '@/hooks/useBridgeExecution'
import { formatBalance, formatTokenAmount, formatDisplayAmount } from '@/services/tokens'
import { ConnectModal } from '@/components/web3/connect-modal'
import { toastError } from '@/lib/toast'
import { useChainTokens } from '@/hooks/useChainTokens'
import { getChainMetadata } from '@/lib/wagmi'
import { ChainSelect } from './chain-select'
import { TokenSelect } from '@/components/swap/token-select'
import { SettingsDialog } from '@/components/swap/settings-dialog'
import { BridgeStatus } from './bridge-status'
import { ArrowDownUp, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { isValidNumberInput } from '@/lib/utils'

export function BridgeCard() {
    const { address, isConnected } = useAccount()
    const walletChainId = useChainId()
    const { switchChain } = useSwitchChain()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const [isRateFlipped, setIsRateFlipped] = useState(false)
    const [showStatus, setShowStatus] = useState(false)
    const [isFeeExpanded, setIsFeeExpanded] = useState(false)

    const {
        fromChainId,
        toChainId,
        fromToken,
        toToken,
        amountIn,
        settings,
        setFromChainId,
        setToChainId,
        setFromToken,
        setToToken,
        setAmountIn,
        setSlippage,
        swapDirection,
    } = useBridgeStore()

    const { tokens: fromTokens } = useChainTokens(fromChainId)
    const { tokens: toTokens } = useChainTokens(toChainId)

    // Initialize default tokens when chains change
    const hasInitializedRef = useRef(false)
    useEffect(() => {
        if (!hasInitializedRef.current && fromTokens.length > 0 && !fromToken) {
            setFromToken(fromTokens[0]!)
        }
    }, [fromTokens, fromToken, setFromToken])

    useEffect(() => {
        if (toTokens.length > 0 && !toToken) {
            setToToken(toTokens[0]!)
        }
    }, [toTokens, toToken, setToToken])

    const {
        balance: balanceInValue,
        isLoading: isLoadingBalanceIn,
        refetch: refetchBalanceIn,
    } = useTokenBalance({
        token: fromToken,
        address,
    })

    const {
        route,
        estimatedOutput,
        isLoading: isQuoteLoading,
        error: _quoteError,
        gasCostUSD,
        feeCosts,
        estimatedDuration,
    } = useBridgeQuote()

    const { execute, isExecuting, activeRoute, isSuccess: _isBridgeSuccess } = useBridgeExecution()

    const isWrongChain = isConnected && walletChainId !== fromChainId

    const amountInBigInt = useMemo(() => {
        if (!amountIn || !fromToken) return 0n
        try {
            return parseUnits(amountIn, fromToken.decimals)
        } catch {
            return 0n
        }
    }, [amountIn, fromToken])

    const isInsufficientBalance = amountInBigInt > 0n && amountInBigInt > balanceInValue
    const isSameChain = fromChainId === toChainId

    const handleBridge = async () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        if (isWrongChain) {
            switchChain({ chainId: fromChainId })
            return
        }
        if (!route) return
        try {
            setShowStatus(true)
            await execute(route)
            refetchBalanceIn()
        } catch (err) {
            toastError(err instanceof Error ? err : 'Bridge failed', 'Bridge execution failed')
        }
    }

    const handleSettingsSave = (slippage: number) => {
        setSlippage(slippage / 100)
    }

    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `~${Math.round(seconds)}s`
        const minutes = Math.round(seconds / 60)
        return `~${minutes}m`
    }

    return (
        <Card>
            <CardContent className="p-0">
                {/* From section */}
                <div className="space-y-2 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="bridge-amount-in">From</Label>
                            <ChainSelect selectedChainId={fromChainId} onSelect={setFromChainId} />
                        </div>
                        <span
                            className="text-xs text-muted-foreground cursor-pointer hover:underline"
                            onClick={() => {
                                if (fromToken && balanceInValue > 0n) {
                                    setAmountIn(
                                        formatTokenAmount(balanceInValue, fromToken.decimals)
                                    )
                                }
                            }}
                        >
                            Balance:{' '}
                            {fromToken
                                ? isLoadingBalanceIn
                                    ? '...'
                                    : formatBalance(balanceInValue, fromToken.decimals)
                                : '0'}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            id="bridge-amount-in"
                            type="text"
                            placeholder="0.0"
                            className="flex-1 h-10 text-xl font-medium md:text-xl"
                            autoFocus
                            autoComplete="off"
                            inputMode="decimal"
                            pattern="^[0-9]*\.?[0-9]*$"
                            value={amountIn}
                            onChange={(e) => {
                                if (isValidNumberInput(e.target.value)) {
                                    setAmountIn(e.target.value)
                                }
                            }}
                        />
                        <TokenSelect
                            token={fromToken}
                            tokens={fromTokens}
                            onSelect={setFromToken}
                        />
                    </div>
                </div>

                {/* Swap direction button */}
                <div className="relative flex items-center justify-center py-1">
                    <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-10 h-8 w-8 rounded-full border bg-background"
                        onClick={swapDirection}
                    >
                        <ArrowDownUp className="h-4 w-4" />
                    </Button>
                </div>

                {/* To section */}
                <div className="space-y-2 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="bridge-amount-out">To</Label>
                            <ChainSelect selectedChainId={toChainId} onSelect={setToChainId} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            id="bridge-amount-out"
                            type="text"
                            placeholder="0.0"
                            className="flex-1 h-10 text-xl font-medium md:text-xl"
                            readOnly
                            autoComplete="off"
                            value={isQuoteLoading ? '...' : estimatedOutput}
                        />
                        <TokenSelect token={toToken} tokens={toTokens} onSelect={setToToken} />
                    </div>
                </div>

                {/* Bottom section: quote, settings, button, status */}
                <div className="space-y-4 p-6 pt-0">
                    {route && !isQuoteLoading && (
                        <Card className="bg-muted/50 p-1">
                            <CardContent className="space-y-1 p-3 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Rate</span>
                                    <span
                                        className="font-medium cursor-pointer hover:underline flex items-center gap-1"
                                        onClick={() => setIsRateFlipped(!isRateFlipped)}
                                        title="Click to flip rate"
                                    >
                                        {!isRateFlipped ? (
                                            <>
                                                1 {fromToken?.symbol} ={' '}
                                                {amountIn && parseFloat(amountIn) > 0
                                                    ? (
                                                          parseFloat(estimatedOutput) /
                                                          parseFloat(amountIn)
                                                      ).toFixed(6)
                                                    : '0'}{' '}
                                                {toToken?.symbol}
                                            </>
                                        ) : (
                                            <>
                                                1 {toToken?.symbol} ={' '}
                                                {estimatedOutput && parseFloat(estimatedOutput) > 0
                                                    ? (
                                                          parseFloat(amountIn) /
                                                          parseFloat(estimatedOutput)
                                                      ).toFixed(6)
                                                    : '0'}{' '}
                                                {fromToken?.symbol}
                                            </>
                                        )}
                                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Min. Received</span>
                                    <span className="font-medium">
                                        {toToken
                                            ? `${formatDisplayAmount(BigInt(route.toAmountMin), toToken.decimals)} ${toToken.symbol}`
                                            : '-'}
                                    </span>
                                </div>
                                {gasCostUSD && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Fee</span>
                                        <span className="font-medium">${gasCostUSD}</span>
                                    </div>
                                )}
                                {feeCosts.length > 0 && (
                                    <div>
                                        <div
                                            className="flex justify-between cursor-pointer select-none"
                                            onClick={() => setIsFeeExpanded(!isFeeExpanded)}
                                        >
                                            <span className="text-muted-foreground flex items-center gap-1">
                                                Bridge Fee
                                                {isFeeExpanded ? (
                                                    <ChevronUp className="h-3 w-3" />
                                                ) : (
                                                    <ChevronDown className="h-3 w-3" />
                                                )}
                                            </span>
                                            <span className="font-medium">
                                                {feeCosts
                                                    .reduce(
                                                        (sum, f) => sum + parseFloat(f.percentage),
                                                        0
                                                    )
                                                    .toFixed(4)
                                                    .replace(/0+$/, '')
                                                    .replace(/\.$/, '')}
                                                %
                                            </span>
                                        </div>
                                        {isFeeExpanded && (
                                            <div className="mt-1 space-y-0.5 pl-2 border-l border-border">
                                                {feeCosts.map((f, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex justify-between text-muted-foreground"
                                                    >
                                                        <span>{f.name}</span>
                                                        <span>
                                                            {f.percentage}%{' '}
                                                            {f.amountUSD &&
                                                            f.amountUSD !== '0' &&
                                                            f.amountUSD !== '0.0'
                                                                ? `($${f.amountUSD})`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {estimatedDuration != null && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Est. Time</span>
                                        <span className="font-medium">
                                            {formatDuration(estimatedDuration)}
                                        </span>
                                    </div>
                                )}
                                {route.steps[0]?.toolDetails && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Provider</span>
                                        <span className="font-medium">
                                            {route.steps[0].toolDetails.name}
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Settings */}
                    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <SettingsDialog
                                currentSlippage={settings.slippage * 100}
                                currentDeadlineMinutes={20}
                                onSave={handleSettingsSave}
                            />
                            <span>Slippage: {(settings.slippage * 100).toFixed(1)}%</span>
                        </div>
                    </div>

                    {/* Bridge button */}
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={
                            isQuoteLoading ||
                            !fromToken ||
                            !toToken ||
                            isSameChain ||
                            isInsufficientBalance ||
                            isExecuting ||
                            (!route && !isWrongChain)
                        }
                        onClick={handleBridge}
                    >
                        {!isConnected
                            ? 'Connect Wallet'
                            : isSameChain
                              ? 'Select Different Chains'
                              : isWrongChain
                                ? `Switch to ${getChainMetadata(fromChainId)?.name ?? 'Source Chain'}`
                                : isInsufficientBalance
                                  ? 'Insufficient Balance'
                                  : !amountIn || parseFloat(amountIn) <= 0
                                    ? 'Enter Amount'
                                    : isExecuting
                                      ? 'Bridging...'
                                      : isQuoteLoading
                                        ? 'Fetching Quote...'
                                        : !route
                                          ? 'No Route Available'
                                          : 'Bridge'}
                    </Button>

                    {/* Bridge status tracker */}
                    {showStatus && activeRoute && (
                        <BridgeStatus
                            route={activeRoute}
                            onComplete={() => {
                                refetchBalanceIn()
                            }}
                        />
                    )}
                </div>

                <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
            </CardContent>
        </Card>
    )
}
