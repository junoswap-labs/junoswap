'use client'

import { useMemo } from 'react'
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSimulateContract,
    useChainId,
} from 'wagmi'
import type { Address, Hex } from 'viem'
import type {
    AddLiquidityParams,
    IncreaseLiquidityParams,
    PositionWithTokens,
    PositionDetails,
} from '@/types/earn'
import { getV3Config } from '@/lib/dex-config'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import {
    buildMintParams,
    buildMintWithNativeMulticall,
    buildPoolCreationMulticall,
    buildIncreaseLiquidityParams,
    buildIncreaseLiquidityWithNativeMulticall,
} from '@/services/liquidity/add-liquidity'
import { buildRemoveWithCollectMulticall } from '@/services/liquidity/remove-liquidity'
import {
    buildCollectWithUnwrapMulticall,
    buildCollectFeesParams,
} from '@/services/liquidity/fee-collection'
import { getWrappedNativeAddress } from '@/services/tokens'
import {
    calculateMinAmounts,
    tickToSqrtPriceX96,
    getAmountsForLiquidity,
} from '@/lib/liquidity-helpers'

export function useAddLiquidity(params: AddLiquidityParams | null, skipSimulation?: boolean) {
    const chainId = useChainId()
    const dexConfig = getV3Config(chainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = !!params && !!positionManager
    const { callData, value } = useMemo(() => {
        if (!params) return { callData: null, value: 0n }

        if (params.createPool && params.initialSqrtPriceX96) {
            const { data, value } = buildPoolCreationMulticall(
                params,
                chainId,
                params.initialSqrtPriceX96
            )
            return {
                callData: {
                    functionName: 'multicall' as const,
                    args: [data] as [Hex[]],
                },
                value,
            }
        }

        const { data, value } = buildMintWithNativeMulticall(params, chainId)
        if (data.length === 1) {
            const mintParams = buildMintParams(params)
            return {
                callData: {
                    functionName: 'mint' as const,
                    args: [mintParams] as const,
                },
                value: 0n,
            }
        }
        return {
            callData: {
                functionName: 'multicall' as const,
                args: [data] as [Hex[]],
            },
            value,
        }
    }, [params, chainId])
    const {
        data: simulationData,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        ...callData,
        value,
        query: {
            enabled: isEnabled && !!callData && !skipSimulation,
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({
        hash,
    })
    const mint = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }
    return {
        mint,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        isError: !!writeError || !!receiptError,
        error: writeError || receiptError || null,
        hash,
        simulationError,
    }
}

export function useIncreaseLiquidity(
    tokenId: bigint | undefined,
    amount0Desired: bigint,
    amount1Desired: bigint,
    position: PositionWithTokens | null,
    slippageBps: number = 50,
    deadlineMinutes: number = 20,
    skipSimulation?: boolean
) {
    const chainId = useChainId()
    const dexConfig = getV3Config(chainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = tokenId !== undefined && !!positionManager && !!position
    const hasNativeToken = useMemo(() => {
        if (!position) return false
        const wrappedNative = getWrappedNativeAddress(chainId)
        return (
            position.token0.toLowerCase() === wrappedNative.toLowerCase() ||
            position.token1.toLowerCase() === wrappedNative.toLowerCase()
        )
    }, [position, chainId])
    const nativeAmount = useMemo(() => {
        if (!position || !hasNativeToken) return 0n
        const wrappedNative = getWrappedNativeAddress(chainId)
        if (position.token0.toLowerCase() === wrappedNative.toLowerCase()) {
            return amount0Desired
        }
        return amount1Desired
    }, [position, hasNativeToken, chainId, amount0Desired, amount1Desired])
    const { callData, value } = useMemo(() => {
        if (!tokenId || !position) return { callData: null, value: 0n }
        const params: IncreaseLiquidityParams = {
            tokenId,
            amount0Desired,
            amount1Desired,
            slippageTolerance: slippageBps,
            deadline: deadlineMinutes,
        }
        const { data, value } = buildIncreaseLiquidityWithNativeMulticall(
            params,
            hasNativeToken,
            nativeAmount
        )
        if (data.length === 1) {
            const increaseParams = buildIncreaseLiquidityParams(params)
            return {
                callData: {
                    functionName: 'increaseLiquidity' as const,
                    args: [increaseParams] as const,
                },
                value: 0n,
            }
        }
        return {
            callData: {
                functionName: 'multicall' as const,
                args: [data] as [Hex[]],
            },
            value,
        }
    }, [
        tokenId,
        position,
        amount0Desired,
        amount1Desired,
        slippageBps,
        deadlineMinutes,
        hasNativeToken,
        nativeAmount,
    ])
    const {
        data: simulationData,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        ...callData,
        value,
        query: {
            enabled: isEnabled && !!callData && !skipSimulation,
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({
        hash,
    })
    const increase = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }
    return {
        increase,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        isError: !!writeError || !!receiptError,
        error: writeError || receiptError || null,
        hash,
        simulationError,
    }
}

export function useRemoveLiquidity(
    position: PositionDetails | null,
    percentage: number, // 0-100
    recipient: Address | undefined,
    slippageBps: number = 50,
    deadlineMinutes: number = 20
) {
    const chainId = useChainId()
    const dexConfig = getV3Config(chainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = !!position && !!recipient && !!positionManager && percentage > 0
    const { liquidityToRemove, amount0Min, amount1Min } = useMemo(() => {
        if (!position || percentage <= 0) {
            return { liquidityToRemove: 0n, amount0Min: 0n, amount1Min: 0n }
        }
        const liquidityToRemove = (position.liquidity * BigInt(percentage)) / 100n
        const sqrtPriceAX96 = tickToSqrtPriceX96(position.tickLower)
        const sqrtPriceBX96 = tickToSqrtPriceX96(position.tickUpper)
        const { amount0, amount1 } = getAmountsForLiquidity(
            position.sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidityToRemove
        )
        const { amount0Min, amount1Min } = calculateMinAmounts(amount0, amount1, slippageBps)
        return { liquidityToRemove, amount0Min, amount1Min }
    }, [position, percentage, slippageBps])
    const callData = useMemo(() => {
        if (!position || !recipient || liquidityToRemove === 0n) return null
        const data = buildRemoveWithCollectMulticall(
            {
                tokenId: position.tokenId,
                liquidity: liquidityToRemove,
                amount0Min,
                amount1Min,
                deadline: deadlineMinutes,
                collectFees: true,
            },
            recipient,
            position.token0,
            position.token1,
            chainId
        )
        return {
            functionName: 'multicall' as const,
            args: [data] as [Hex[]],
        }
    }, [position, recipient, liquidityToRemove, amount0Min, amount1Min, deadlineMinutes, chainId])
    const {
        data: simulationData,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        ...callData,
        query: {
            enabled: isEnabled && !!callData,
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({
        hash,
    })
    const remove = () => {
        if (!simulationData?.request) {
            const errorMsg = simulationError
                ? `Transaction simulation failed: ${simulationError.message}`
                : 'Transaction is not ready. Please wait...'
            throw new Error(errorMsg)
        }
        writeContract(simulationData.request)
    }
    return {
        remove,
        liquidityToRemove,
        amount0Min,
        amount1Min,
        isPreparing: isSimulating,
        isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        isError: !!writeError || !!receiptError,
        error: writeError || receiptError || null,
        hash,
        simulationError,
    }
}

export function useCollectFees(
    position: PositionWithTokens | null,
    recipient: Address | undefined
) {
    const chainId = useChainId()
    const dexConfig = getV3Config(chainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = !!position && !!recipient && !!positionManager
    const callData = useMemo(() => {
        if (!position || !recipient) return null
        const data = buildCollectWithUnwrapMulticall(
            position.tokenId,
            recipient,
            position.token0,
            position.token1,
            chainId
        )
        if (data.length === 1) {
            const collectParams = buildCollectFeesParams(position.tokenId, recipient)
            return {
                functionName: 'collect' as const,
                args: [collectParams] as const,
            }
        }
        return {
            functionName: 'multicall' as const,
            args: [data] as [Hex[]],
        }
    }, [position, recipient, chainId])
    const {
        data: simulationData,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        ...callData,
        query: {
            enabled: isEnabled && !!callData,
        },
    })
    const {
        writeContract,
        data: hash,
        isPending: isExecuting,
        error: writeError,
    } = useWriteContract()
    const {
        isLoading: isConfirming,
        isSuccess,
        error: receiptError,
    } = useWaitForTransactionReceipt({
        hash,
    })
    const collect = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }
    return {
        collect,
        hasFees: position
            ? position.uncollectedFees0 > 0n || position.uncollectedFees1 > 0n
            : false,
        fees0: position?.uncollectedFees0 ?? 0n,
        fees1: position?.uncollectedFees1 ?? 0n,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        isError: !!writeError || !!receiptError,
        error: writeError || receiptError || null,
        hash,
        simulationError,
    }
}
