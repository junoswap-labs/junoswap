'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain } from 'wagmi'
import { parseUnits, formatEther, formatUnits, parseEther, zeroAddress } from 'viem'
import type { Address } from 'viem'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useBondingCurveSwapExecution } from '@/hooks/useBondingCurveSwapExecution'
import { useSwapExecution } from '@/hooks/useSwapExecution'
import { useUniV3Quote } from '@/hooks/useUniV3Quote'
import { useGraduate } from '@/hooks/useGraduate'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { useKkubUnwrap } from '@/hooks/useKkubUnwrap'
import { useOnTxSuccess } from '@/hooks/useOnTxSuccess'
import { TxFlowDialog, actionStep, approvalStep, type TxStep } from '@/components/ui/tx-flow-dialog'
import { TxStageFlow } from '@/components/ui/tx-stage'
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { getGraduationMode } from '@/lib/launchpad-curve'
import type { Token } from '@/types/token'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { isValidNumberInput } from '@/lib/utils'
import { formatKub, formatTokenAmount } from '@/services/launchpad/launchpad'
import { computeCurve } from '@coshi190/juno-moneta-sdk'
import { calculateMinOutput } from '@/services/dex/slippage'
import { toastSuccess, toastError } from '@/lib/toast'
import { getChainMetadata, NATIVE_TOKEN_ADDRESS, shouldSkipUnwrap } from '@/lib/wagmi'
import { ConnectModal } from '@/components/web3/connect-modal'
import { SettingsMenu } from '@/components/swap/settings-menu'
import { useSwapStore } from '@/store/swap-store'
import { getDefaultPairTokens } from '@/lib/tokens'
interface TokenTradeCardProps {
    tokenAddr: Address
    tokenSymbol?: string
    tokenLogo?: string
    tokenDecimals?: number
    isGraduated: boolean
    poolAddress?: Address
    poolFee?: number
    isPoolLoading?: boolean
    /** Which curve deployment this token trades on. Defaults to the chain's primary launchpad. */
    launchpadId?: string
    dexId?: string
}

export function PercentButtons({ onSelect }: { onSelect: (pct: number) => void }) {
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

export function AmountButtons({ onSelect }: { onSelect: (amount: string) => void }) {
    const presets = ['5', '20', '50']
    return (
        <div className="flex gap-1.5">
            {presets.map((amount) => (
                <button
                    key={amount}
                    onClick={() => onSelect(amount)}
                    className="flex-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors border border-transparent hover:border-border hover:bg-accent hover:text-foreground"
                >
                    {amount} KUB
                </button>
            ))}
        </div>
    )
}

export function TokenTradeCard({
    tokenAddr,
    tokenSymbol = 'TOKEN',
    tokenLogo,
    tokenDecimals = 18,
    isGraduated: _initialIsGraduated,
    poolAddress,
    poolFee,
    isPoolLoading = false,
    launchpadId,
    dexId,
}: TokenTradeCardProps) {
    const { address, isConnected } = useAccount()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
    const [txOpen, setTxOpen] = useState(false)
    const [txKind, setTxKind] = useState<'buy' | 'sell' | 'graduate'>('buy')
    // Frozen when the flow opens: the allowance lands mid-flow and rebuilding from
    // needsSellApproval would delete the step being watched.
    const [flowNeedsApproval, setFlowNeedsApproval] = useState(false)
    const [buyAmount, setBuyAmount] = useState('')
    const [sellAmount, setSellAmount] = useState('')
    const { settings, setSlippage, setDeadlineMinutes } = useSwapStore()

    const chainId = useLaunchpadChainId()
    const bondingCurveAddress = getBondingCurveDeployment(chainId, launchpadId)?.address

    const walletChainId = useChainId()
    const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
    const wrongChain = isConnected && walletChainId !== chainId
    const activeChainName = getChainMetadata(chainId)?.name || `Chain ${chainId}`

    const {
        nativeReserve,
        tokenReserve,
        isGraduated,
        virtualAmount,
        graduationAmount,
        refetch: refetchReserves,
    } = useTokenReserves({
        tokenAddr,
        isGraduated: _initialIsGraduated,
        chainId,
        launchpadId,
    })

    const { graduation } = computeCurve({
        nativeReserve,
        tokenReserve,
        virtualAmount,
        graduationAmount,
        isGraduated,
        graduationMode: getGraduationMode(launchpadId),
    })
    const readyToGraduate = graduation.isReady

    const {
        graduate,
        step: graduateStep,
        stepLabel: graduateStepLabel,
        needsRescue,
        isPreparing: isGraduatePreparing,
        isExecuting: isGraduateExecuting,
        isSuccess: isGraduateSuccess,
        isError: isGraduateError,
        error: graduateError,
        hash: graduateHash,
    } = useGraduate({
        tokenAddr,
        launchpadId,
        enabled: readyToGraduate,
    })

    const { data: nativeBalance, refetch: refetchNative } = useBalance({
        address,
        chainId,
    })

    const { data: tokenBalance, refetch: refetchTokens } = useReadContract({
        address: tokenAddr,
        abi: getAbi('erc20'),
        functionName: 'balanceOf',
        args: [address ?? zeroAddress],
        chainId,
        query: { enabled: !!address },
    })

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

    const {
        execute: bcBuy,
        canExecute: canBuyBC,
        expectedOut: bcBuyExpectedOut,
        minOut: bcMinTokenOut,
        isPreparing: isBuyPreparingBC,
        isExecuting: isBuyExecutingBC,
        isConfirming: isBuyConfirmingBC,
        isSuccess: isBuySuccessBC,
        isError: isBuyErrorBC,
        error: buyErrorBC,
        hash: buyHashBC,
    } = useBondingCurveSwapExecution({
        side: 'buy',
        tokenAddr,
        amount: buyAmountWei,
        nativeReserve,
        tokenReserve,
        virtualAmount,
        launchpadId,
        enabled: !isGraduated && !readyToGraduate,
    })

    const slippageBps = Math.round(settings.slippage * 100)
    // Third-party (Durianfun) graduated tokens land on Kublerx pools, which aren't in Junoswap's
    // own indexed pool list -- route those through the 'kublerx' dex instead of the default.
    const launchpadDex = dexId ?? 'junoswap'
    const nativeToken = useMemo<Token>(() => {
        const native = getDefaultPairTokens(chainId).nativeTokens[0]
        if (native) return native
        const meta = getChainMetadata(chainId)
        return {
            address: NATIVE_TOKEN_ADDRESS,
            symbol: meta?.symbol ?? 'KUB',
            name: meta?.name ?? 'Native',
            decimals: 18,
            chainId,
        }
    }, [chainId])
    const launchpadToken = useMemo<Token>(
        () => ({
            address: tokenAddr,
            symbol: tokenSymbol,
            name: '',
            decimals: tokenDecimals,
            chainId,
        }),
        [tokenAddr, tokenSymbol, tokenDecimals, chainId]
    )

    // poolAddress is only resolvable for Junoswap's own indexed pools -- non-Junoswap dexes
    // (e.g. Kublerx, where Durianfun tokens graduate to) quote/swap via the SDK's
    // quoter/swapRouter directly and don't need it.
    const v3BuyEnabled = isGraduated && (launchpadDex === 'junoswap' ? !!poolAddress : true)
    const { quote: v3BuyQuote } = useUniV3Quote({
        tokenIn: nativeToken,
        tokenOut: launchpadToken,
        amountIn: buyAmountWei,
        enabled: v3BuyEnabled && buyAmountWei > 0n,
        dexId: launchpadDex,
    })
    const v3BuyExpectedOut = v3BuyQuote?.amountOut ?? 0n
    const v3MinTokenOut = useMemo(
        () => calculateMinOutput(v3BuyExpectedOut, slippageBps),
        [v3BuyExpectedOut, slippageBps]
    )

    const {
        swap: v3Buy,
        canSwap: canBuyV3,
        isPreparing: isBuyPreparingV3,
        isExecuting: isBuyExecutingV3,
        isConfirming: isBuyConfirmingV3,
        isSuccess: isBuySuccessV3,
        isError: isBuyErrorV3,
        error: buyErrorV3,
        hash: buyHashV3,
    } = useSwapExecution({
        protocol: 'v3',
        tokenIn: nativeToken,
        tokenOut: launchpadToken,
        amountIn: buyAmountWei,
        amountOutMinimum: v3MinTokenOut,
        recipient: address ?? zeroAddress,
        deadlineMinutes: settings.deadlineMinutes,
        fee: poolFee ?? 10000,
        dexId: launchpadDex,
        skipSimulation: !v3BuyEnabled,
    })

    const {
        execute: bcSell,
        canExecute: canSellBC,
        expectedOut: bcSellExpectedOut,
        minOut: bcMinNativeOut,
        isPreparing: isSellPreparingBC,
        isExecuting: isSellExecutingBC,
        isConfirming: isSellConfirmingBC,
        isSuccess: isSellSuccessBC,
        isError: isSellErrorBC,
        error: sellErrorBC,
        hash: sellHashBC,
    } = useBondingCurveSwapExecution({
        side: 'sell',
        tokenAddr,
        amount: sellAmountWei,
        nativeReserve,
        tokenReserve,
        virtualAmount,
        launchpadId,
        enabled: !isGraduated,
    })

    const { quote: v3SellQuote } = useUniV3Quote({
        tokenIn: launchpadToken,
        tokenOut: nativeToken,
        amountIn: sellAmountWei,
        enabled: v3BuyEnabled && sellAmountWei > 0n,
        dexId: launchpadDex,
    })
    const v3SellExpectedOut = v3SellQuote?.amountOut ?? 0n
    const v3MinNativeOut = useMemo(
        () => calculateMinOutput(v3SellExpectedOut, slippageBps),
        [v3SellExpectedOut, slippageBps]
    )

    const v3Config =
        getDexes(chainId, 'v3').find((dex) => dex.dexId === launchpadDex) ??
        getDexes(chainId, 'v3')[0]
    const sellSpender = isGraduated
        ? (v3Config?.swapRouter ?? bondingCurveAddress)
        : bondingCurveAddress

    const {
        needsApproval: needsSellApproval,
        isApproving: isApprovingSell,
        isConfirming: isConfirmingApproval,
        isSuccess: isSellApproved,
        isError: isSellApproveError,
        error: sellApproveError,
        hash: sellApproveHash,
        approve: approveSell,
        reset: resetSellApproval,
    } = useTokenApproval({
        token: {
            address: tokenAddr,
            symbol: tokenSymbol,
            name: '',
            decimals: tokenDecimals,
            chainId,
        },
        owner: address,
        spender: sellSpender,
        amountToApprove: sellAmountWei,
    })

    const sellUnwrapsNative = launchpadDex === 'junoswap' && !shouldSkipUnwrap(chainId)

    const {
        swap: v3Sell,
        canSwap: canSellV3,
        isPreparing: isSellPreparingV3,
        isExecuting: isSellExecutingV3,
        isConfirming: isSellConfirmingV3,
        isSuccess: isSellSuccessV3,
        isError: isSellErrorV3,
        error: sellErrorV3,
        hash: sellHashV3,
    } = useSwapExecution({
        protocol: 'v3',
        tokenIn: launchpadToken,
        tokenOut: nativeToken,
        amountIn: sellAmountWei,
        amountOutMinimum: v3MinNativeOut,
        recipient: address ?? zeroAddress,
        deadlineMinutes: settings.deadlineMinutes,
        fee: poolFee ?? 10000,
        dexId: launchpadDex,
        // Only Junoswap's router on a chain whose wrapped native unwraps freely. On KUB mainnet
        // KKUB.withdraw requires exchange KYC ("only kyc address registered with phone number
        // can withdraw") for every router, Junoswap's included, so forcing the unwrap there
        // reverted every graduated sell for a non-KYC wallet. Those sells, like any third-party
        // router's, skip the unwrap and pay out wrapped native.
        forceUnwrapNative: sellUnwrapsNative,
        skipSimulation: !v3BuyEnabled || needsSellApproval,
    })

    // A sell that skips the unwrap settles in wrapped native (e.g. KKUB), so the UI must say so
    // rather than implying a native payout.
    const sellReceivesWrappedNative = isGraduated && !sellUnwrapsNative
    const wrappedNativeSymbol = nativeToken.symbol === 'KUB' ? 'KKUB' : `W${nativeToken.symbol}`

    // A wrapped payout can still end as native: KUB's unwrapper contract withdraws KKUB without
    // the exchange KYC the routers hit, as a transaction after the sell. Opt-out, on by default.
    const canUnwrapSell = sellReceivesWrappedNative && shouldSkipUnwrap(chainId)
    const [outputNative, setOutputNative] = useState(true)
    // Fixed at click: the quote moves once the sell lands, and useKkubUnwrap resets on any
    // amount change. Unwrapping the minimum received leaves slippage dust as KKUB, never more.
    const [unwrapAmount, setUnwrapAmount] = useState(0n)
    const kkubUnwrap = useKkubUnwrap({ chainId, amount: unwrapAmount, owner: address })
    const sellOutputSymbol =
        sellReceivesWrappedNative && !(canUnwrapSell && outputNative)
            ? wrappedNativeSymbol
            : nativeToken.symbol

    const canBuy = isGraduated ? canBuyV3 : canBuyBC
    const canSell = isGraduated ? canSellV3 : canSellBC
    const buyExpectedOut = isGraduated ? v3BuyExpectedOut : bcBuyExpectedOut
    const minTokenOut = isGraduated ? v3MinTokenOut : bcMinTokenOut
    const isBuyPreparing = isGraduated ? isBuyPreparingV3 : isBuyPreparingBC
    const isBuyExecuting = isGraduated ? isBuyExecutingV3 : isBuyExecutingBC
    const isBuyConfirming = isGraduated ? isBuyConfirmingV3 : isBuyConfirmingBC
    const isBuySuccess = isGraduated ? isBuySuccessV3 : isBuySuccessBC
    const isBuyError = isGraduated ? isBuyErrorV3 : isBuyErrorBC
    const buyError = isGraduated ? buyErrorV3 : buyErrorBC
    const buyHash = isGraduated ? buyHashV3 : buyHashBC

    const sellExpectedOut = isGraduated ? v3SellExpectedOut : bcSellExpectedOut
    const minNativeOut = isGraduated ? v3MinNativeOut : bcMinNativeOut
    const isSellPreparing = isGraduated ? isSellPreparingV3 : isSellPreparingBC
    const isSellExecuting = isGraduated ? isSellExecutingV3 : isSellExecutingBC
    const isSellConfirming = isGraduated ? isSellConfirmingV3 : isSellConfirmingBC
    const isSellSuccess = isGraduated ? isSellSuccessV3 : isSellSuccessBC
    const isSellError = isGraduated ? isSellErrorV3 : isSellErrorBC
    const sellError = isGraduated ? sellErrorV3 : sellErrorBC
    const sellHash = isGraduated ? sellHashV3 : sellHashBC

    // Keyed on the hash: a finished trade stays isSuccess, and refetch identities change.
    useOnTxSuccess(true, isBuySuccess, buyHash, () => {
        const metadata = getChainMetadata(chainId)
        toastSuccess('Buy successful!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${buyHash}`, '_blank'),
            },
        })
        refetchReserves()
        refetchNative()
        refetchTokens()
    })

    useOnTxSuccess(true, isSellSuccess, sellHash, () => {
        const metadata = getChainMetadata(chainId)
        toastSuccess('Sell successful!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${sellHash}`, '_blank'),
            },
        })
        refetchReserves()
        refetchNative()
        refetchTokens()
    })

    useOnTxSuccess(true, isGraduateSuccess, graduateHash, () => {
        const metadata = getChainMetadata(chainId)
        toastSuccess('Token graduated!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${graduateHash}`, '_blank'),
            },
        })
        refetchReserves()
    })

    useEffect(() => {
        if (isBuyError && buyError) toastError(buyError, 'Buy failed')
    }, [isBuyError, buyError])

    useEffect(() => {
        if (isSellError && sellError) toastError(sellError, 'Sell failed')
    }, [isSellError, sellError])

    useEffect(() => {
        if (isGraduateError && graduateError) toastError(graduateError, 'Graduation failed')
    }, [isGraduateError, graduateError])

    const handleBuyInputChange = (value: string) => {
        if (isValidNumberInput(value)) setBuyAmount(value)
    }

    const handleSellInputChange = (value: string) => {
        if (isValidNumberInput(value)) setSellAmount(value)
    }

    const handleSellPercent = (pct: number) => {
        if (!tokenBalance) return
        const balance = tokenBalance as bigint
        const amount = (balance * BigInt(pct)) / 100n
        setSellAmount(formatEther(amount))
    }

    const runBuy = () => (isGraduated ? v3Buy() : bcBuy())
    const runSell = () => (isGraduated ? v3Sell() : bcSell())

    const handleBuy = () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        if (wrongChain) {
            switchChain({ chainId })
            return
        }
        setTxKind('buy')
        setFlowNeedsApproval(false)
        setTxOpen(true)
        runBuy()
    }

    const handleSell = () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        if (wrongChain) {
            switchChain({ chainId })
            return
        }
        setTxKind('sell')
        setFlowNeedsApproval(needsSellApproval)
        resetSellApproval()
        setTxOpen(true)
        if (needsSellApproval) {
            approveSell()
            return
        }
        if (isGraduated) {
            // A repeat sell of the same amount wouldn't retrigger the hook's amount reset.
            kkubUnwrap.reset()
            setUnwrapAmount(canUnwrapSell && outputNative ? v3MinNativeOut : 0n)
            v3Sell()
        } else {
            bcSell()
        }
        runSell()
    }

    useOnTxSuccess(true, isSellSuccessV3, sellHashV3, () => {
        if (unwrapAmount > 0n) kkubUnwrap.startUnwrap()
    })
    useEffect(() => {
        if (kkubUnwrap.isSuccess) {
            toastSuccess(`Unwrapped to ${nativeToken.symbol}`)
            refetchNative()
        }
    }, [kkubUnwrap.isSuccess, nativeToken.symbol, refetchNative])
    useEffect(() => {
        if (kkubUnwrap.isError) {
            toastError(`Unwrap failed. You received ${wrappedNativeSymbol} instead.`)
        }
    }, [kkubUnwrap.isError, wrappedNativeSymbol])

    const handleGraduate = () => {
        if (!isConnected) {
            setIsConnectModalOpen(true)
            return
        }
        if (wrongChain) {
            switchChain({ chainId })
            return
        }
        setTxKind('graduate')
        setFlowNeedsApproval(false)
        setTxOpen(true)
        graduate()
    }

    /**
     * The card holds three independent flows and swaps between a bonding-curve and a v3
     * hook once the token graduates, so the steps are built from whichever is live.
     */
    const launchToken = { symbol: tokenSymbol, logo: tokenLogo }
    const isSell = txKind === 'sell'
    const tradeFlags = isSell
        ? {
              isPending: isSellPreparing || isSellExecuting,
              isConfirming: isSellConfirming,
              isSuccess: isSellSuccess,
              isError: isSellError,
              error: sellError,
              hash: sellHash,
          }
        : {
              isPending: isBuyPreparing || isBuyExecuting,
              isConfirming: isBuyConfirming,
              isSuccess: isBuySuccess,
              isError: isBuyError,
              error: buyError,
              hash: buyHash,
          }
    const txSteps: TxStep[] = []
    if (txKind === 'graduate') {
        txSteps.push(
            actionStep({
                label: `Graduate ${tokenSymbol}`,
                flags: {
                    isPending: isGraduateExecuting,
                    isSuccess: isGraduateSuccess,
                    isError: isGraduateError,
                    error: graduateError,
                    hash: graduateHash,
                },
                run: graduate,
                renderStage: (phase) => (
                    <TxStageFlow
                        phase={phase}
                        chainId={chainId}
                        hash={graduateHash}
                        from={{ kind: 'token', token: launchToken, amount: 'Bonding curve' }}
                        to={{
                            kind: 'contract',
                            label: 'V3 pool',
                            address: poolAddress,
                            amount: 'Graduated',
                        }}
                    />
                ),
            })
        )
    } else {
        if (flowNeedsApproval) {
            txSteps.push(
                approvalStep({
                    token: launchToken,
                    spenderLabel: isGraduated ? 'Swap router' : 'Bonding curve',
                    spender: sellSpender,
                    chainId,
                    run: approveSell,
                    flags: {
                        isPending: isApprovingSell,
                        isConfirming: isConfirmingApproval,
                        isSuccess: isSellApproved || !needsSellApproval,
                        isError: isSellApproveError,
                        error: sellApproveError,
                        hash: sellApproveHash,
                    },
                })
            )
        }
        const nativeSide = {
            kind: 'token' as const,
            token: nativeToken,
            amount: isSell ? formatEther(sellExpectedOut ?? 0n) : buyAmount || '0',
        }
        const tokenSide = {
            kind: 'token' as const,
            token: launchToken,
            amount: isSell ? sellAmount || '0' : formatUnits(buyExpectedOut ?? 0n, tokenDecimals),
        }
        txSteps.push(
            actionStep({
                label: isSell ? `Sell ${tokenSymbol}` : `Buy ${tokenSymbol}`,
                flags: tradeFlags,
                run: isSell ? runSell : runBuy,
                autoRun: isSell && canSell && !needsSellApproval,
                renderStage: (phase) => (
                    <TxStageFlow
                        phase={phase}
                        chainId={chainId}
                        hash={tradeFlags.hash}
                        from={isSell ? tokenSide : nativeSide}
                        to={isSell ? nativeSide : tokenSide}
                    />
                ),
            })
        )
    }

    const nearThreshold =
        !isGraduated &&
        !readyToGraduate &&
        graduationAmount > 0n &&
        nativeReserve >= (graduation.target * 90n) / 100n

    const txDialog = (
        <TxFlowDialog
            open={txOpen}
            onOpenChange={setTxOpen}
            title={
                txKind === 'graduate'
                    ? 'Graduate token'
                    : txKind === 'sell'
                      ? `Sell ${tokenSymbol}`
                      : `Buy ${tokenSymbol}`
            }
            steps={txSteps}
            chainId={chainId}
            onDone={() => {
                resetSellApproval()
                if (txKind === 'buy') setBuyAmount('')
                if (txKind === 'sell') setSellAmount('')
            }}
        />
    )

    if (readyToGraduate) {
        return (
            <>
                <Card>
                    <CardContent className="p-4 sm:p-6">
                        <div className="rounded-lg bg-amber-500/10 p-4 sm:p-6 text-center space-y-4">
                            <div>
                                <p className="text-lg font-semibold text-amber-500">
                                    Ready to Graduate!
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {graduateStep === 'done'
                                        ? 'Token has been successfully graduated to Junoswap V3.'
                                        : graduateStep === 'error'
                                          ? 'Graduation failed. Please try again.'
                                          : needsRescue
                                            ? 'Pool price needs correction before graduation. This will be handled automatically.'
                                            : 'This token has reached the graduation threshold. Anyone can trigger graduation to move it to Junoswap.'}
                                </p>
                            </div>
                            <Button
                                variant="warning"
                                size="lg"
                                className="w-full"
                                onClick={handleGraduate}
                                disabled={
                                    wrongChain
                                        ? isSwitchingChain
                                        : isGraduatePreparing ||
                                          isGraduateExecuting ||
                                          graduateStep === 'done'
                                }
                            >
                                {wrongChain
                                    ? isSwitchingChain
                                        ? 'Switching...'
                                        : `Switch to ${activeChainName}`
                                    : isGraduateExecuting
                                      ? graduateStepLabel || 'Processing...'
                                      : isGraduatePreparing
                                        ? 'Preparing...'
                                        : graduateStep === 'done'
                                          ? 'Graduated ✓'
                                          : 'Graduate Token'}
                            </Button>
                            {(isGraduatePreparing || isGraduateExecuting) && (
                                <p className="text-xs text-muted-foreground">
                                    {graduateStepLabel || 'Preparing transaction...'}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
                {txDialog}
            </>
        )
    }

    if (isGraduated && launchpadDex === 'junoswap' && !poolAddress && !isPoolLoading) {
        return (
            <Card>
                <CardContent className="p-4 sm:p-6">
                    <div className="rounded-lg bg-positive/10 p-4 sm:p-6 text-center">
                        <p className="text-lg font-semibold text-positive">Token Graduated!</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            V3 pool not found. Trading unavailable.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card className="overflow-hidden">
                <CardContent className="p-4 sm:p-6">
                    <Tabs
                        value={activeTab}
                        onValueChange={(v) => setActiveTab(v as 'buy' | 'sell')}
                    >
                        <div className="flex items-center gap-2">
                            <TabsList className="relative grid flex-1 grid-cols-2 rounded-lg bg-muted/40 p-1">
                                <TabsTrigger
                                    value="buy"
                                    className="relative z-10 flex items-center justify-center rounded-md py-2 text-sm font-medium tracking-wide uppercase transition-all duration-200 data-[state=active]:bg-positive data-[state=active]:text-positive-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-positive/20"
                                >
                                    Buy
                                </TabsTrigger>
                                <TabsTrigger
                                    value="sell"
                                    className="relative z-10 flex items-center justify-center rounded-md py-2 text-sm font-medium tracking-wide uppercase transition-all duration-200 data-[state=active]:bg-negative data-[state=active]:text-negative-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-negative/20"
                                >
                                    Sell
                                </TabsTrigger>
                            </TabsList>
                            <SettingsMenu
                                slippage={settings.slippage}
                                deadlineMinutes={settings.deadlineMinutes}
                                onSlippageChange={setSlippage}
                                onDeadlineChange={setDeadlineMinutes}
                            />
                        </div>

                        <TabsContent value="buy" className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm min-w-0">
                                    <Label>Amount (KUB)</Label>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground truncate ml-2"
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
                                        className="h-12 sm:h-14 bg-muted/50 border-0 text-base sm:text-lg font-semibold pr-12 sm:pr-16"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                        KUB
                                    </div>
                                </div>
                                <AmountButtons onSelect={(amt) => setBuyAmount(amt)} />
                            </div>

                            {buyAmountWei > 0n && (
                                <Card className="bg-muted/50 p-1">
                                    <CardContent className="space-y-1 p-3 text-xs">
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                You receive (est.)
                                            </span>
                                            <span className="font-medium text-right min-w-0">
                                                {formatTokenAmount(buyExpectedOut)} {tokenSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                Min received
                                            </span>
                                            <span className="font-medium text-right min-w-0">
                                                {formatTokenAmount(minTokenOut)} {tokenSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                Fee
                                            </span>
                                            <span className="font-medium">
                                                {isGraduated
                                                    ? `${((poolFee ?? 10000) / 10000).toFixed(2)}%`
                                                    : '2%'}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <Button
                                variant="default"
                                size="lg"
                                className="w-full"
                                onClick={handleBuy}
                                disabled={
                                    wrongChain
                                        ? isSwitchingChain
                                        : isBuyPreparing ||
                                          isBuyExecuting ||
                                          isBuyConfirming ||
                                          buyAmountWei === 0n ||
                                          (isConnected && buyAmountWei > 0n && !canBuy)
                                }
                            >
                                {wrongChain
                                    ? isSwitchingChain
                                        ? 'Switching...'
                                        : `Switch to ${activeChainName}`
                                    : isBuyExecuting
                                      ? 'Buying...'
                                      : isBuyConfirming
                                        ? 'Confirming...'
                                        : isBuyPreparing
                                          ? 'Preparing...'
                                          : 'Buy'}
                            </Button>
                        </TabsContent>

                        <TabsContent value="sell" className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm min-w-0">
                                    <Label className="shrink-0">Amount ({tokenSymbol})</Label>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground truncate ml-2"
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
                                        className="h-12 sm:h-14 bg-muted/50 border-0 text-base sm:text-lg font-semibold pr-14 sm:pr-20"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground max-w-[80px] truncate">
                                        {tokenSymbol}
                                    </div>
                                </div>
                                <PercentButtons onSelect={handleSellPercent} />
                            </div>

                            {sellAmountWei > 0n && (
                                <Card className="bg-muted/50 p-1">
                                    <CardContent className="space-y-1 p-3 text-xs">
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                You receive (est.)
                                            </span>
                                            <span className="font-medium text-right min-w-0">
                                                {formatKub(sellExpectedOut)} {sellOutputSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                Min received
                                            </span>
                                            <span className="font-medium text-right min-w-0">
                                                {formatKub(minNativeOut)} {sellOutputSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">
                                                Fee
                                            </span>
                                            <span className="font-medium">
                                                {isGraduated
                                                    ? `${((poolFee ?? 10000) / 10000).toFixed(2)}%`
                                                    : '2%'}
                                            </span>
                                        </div>
                                        {canUnwrapSell ? (
                                            <label className="flex cursor-pointer items-center gap-2 pt-1.5 text-[11px] leading-snug text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    checked={outputNative}
                                                    onChange={(e) =>
                                                        setOutputNative(e.target.checked)
                                                    }
                                                    className="h-3.5 w-3.5 accent-primary"
                                                />
                                                Output {nativeToken.symbol} — unwraps{' '}
                                                {wrappedNativeSymbol} in one more transaction
                                            </label>
                                        ) : (
                                            sellReceivesWrappedNative && (
                                                <div className="pt-1 text-[11px] leading-snug text-muted-foreground">
                                                    This pool settles in wrapped{' '}
                                                    {wrappedNativeSymbol}, not native{' '}
                                                    {nativeToken.symbol}.
                                                </div>
                                            )
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {nearThreshold && (
                                <div className="rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                                    Selling may push the reserve below the graduation threshold.
                                </div>
                            )}

                            <Button
                                variant="default"
                                size="lg"
                                className="w-full"
                                onClick={handleSell}
                                disabled={
                                    wrongChain
                                        ? isSwitchingChain
                                        : isSellPreparing ||
                                          kkubUnwrap.isUnwrapping ||
                                          isSellExecuting ||
                                          isSellConfirming ||
                                          isApprovingSell ||
                                          isConfirmingApproval ||
                                          sellAmountWei === 0n ||
                                          (isConnected &&
                                              !needsSellApproval &&
                                              sellAmountWei > 0n &&
                                              !canSell)
                                }
                            >
                                {wrongChain
                                    ? isSwitchingChain
                                        ? 'Switching...'
                                        : `Switch to ${activeChainName}`
                                    : kkubUnwrap.isUnwrapping
                                      ? `Unwrapping to ${nativeToken.symbol}...`
                                      : isApprovingSell || isConfirmingApproval
                                        ? 'Approving...'
                                        : needsSellApproval
                                          ? `Approve ${tokenSymbol}`
                                          : isSellExecuting
                                            ? 'Selling...'
                                            : isSellConfirming
                                              ? 'Confirming...'
                                              : isSellPreparing
                                                ? 'Preparing...'
                                                : 'Sell'}
                            </Button>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />

            {txDialog}
        </>
    )
}
