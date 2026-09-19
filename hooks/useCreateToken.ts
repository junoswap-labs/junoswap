'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import { useWriteContract, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { parseEther } from 'viem'
import type { Address } from 'viem'
import { getAbi, computeCurve, planCurveCall } from '@coshi190/juno-moneta-sdk'
import { INITIAL_TOKEN_SUPPLY } from '@/lib/launchpad-curve'
import { getCurveState } from '@/lib/curve-state'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { calculateMinOutput } from '@/services/dex/slippage'
import { findEventArgs } from '@/services/launchpad/receipt'
import { useSwapStore } from '@/store/swap-store'
import type { CreateTokenForm } from '@/types/launchpad'

type CreatePhase = 'idle' | 'creating' | 'buying' | 'success' | 'error'

interface UseCreateTokenParams {
    form: CreateTokenForm | null
}

interface UseCreateTokenResult {
    create: (logoOverride?: string) => void
    phase: CreatePhase
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
    createdTokenAddress: Address | null
    expectedTokens: bigint
    minTokenOut: bigint
    totalCost: bigint
}

export function useCreateToken({ form }: UseCreateTokenParams): UseCreateTokenResult {
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const { chainId, address: bondingCurveAddress, launchpadId } = useLaunchpadContract()
    const publicClient = usePublicClient({ chainId })

    const [phase, setPhase] = useState<CreatePhase>('idle')
    const [createdTokenAddress, setCreatedTokenAddress] = useState<Address | null>(null)
    const [phaseError, setPhaseError] = useState<Error | null>(null)

    const buyParamsRef = useRef<{
        tokenAddr: Address
        minTokenOut: bigint
        buyAmount: bigint
    } | null>(null)

    const { data: curve } = useQuery({
        queryKey: ['curve-config', chainId, launchpadId],
        queryFn: () => getCurveState(publicClient!, { chainId, launchpadId }),
        enabled: !!publicClient,
    })

    const upfrontBuyNative = useMemo(() => {
        const str = form?.upfrontBuyAmount?.trim()
        if (!str || str === '0' || str === '0.0' || str === '0.00') return 0n
        try {
            const val = parseEther(str)
            return val > 0n ? val : 0n
        } catch {
            return 0n
        }
    }, [form?.upfrontBuyAmount])

    const expectedTokens = useMemo(() => {
        if (upfrontBuyNative <= 0n || !curve) return 0n
        return computeCurve({
            nativeReserve: curve.initialNative,
            tokenReserve: curve.curveReserve ?? INITIAL_TOKEN_SUPPLY,
            virtualAmount: curve.virtualAmount,
            buyAmountIn: upfrontBuyNative,
        }).buyOutput
    }, [upfrontBuyNative, curve])

    const minTokenOut = useMemo(
        () => calculateMinOutput(expectedTokens, slippageBps),
        [expectedTokens, slippageBps]
    )

    const createCost = useMemo(() => {
        if (!curve) return 0n
        return curve.createFee + curve.initialNative
    }, [curve])

    const totalCost = useMemo(() => createCost + upfrontBuyNative, [createCost, upfrontBuyNative])

    const {
        data: createHash,
        writeContract: writeCreate,
        isPending: isCreateExecuting,
        isError: isCreateWriteError,
        error: createWriteError,
    } = useWriteContract()

    const { data: createReceipt } = useQuery({
        queryKey: ['create-token-receipt', createHash],
        queryFn: async () => {
            if (!createHash || !publicClient) return null
            return publicClient.getTransactionReceipt({ hash: createHash })
        },
        enabled: !!createHash && !!publicClient,
        refetchInterval: (query) => {
            if (query.state.data) return false
            return 2000
        },
    })

    const isCreateConfirming = !!createHash && !createReceipt
    const isCreateSuccess = !!createReceipt && createReceipt.status === 'success'

    const {
        data: buyHash,
        writeContract: writeBuy,
        isPending: isBuyExecuting,
        isError: isBuyWriteError,
        error: buyWriteError,
    } = useWriteContract()

    const { data: buyReceipt } = useQuery({
        queryKey: ['upfront-buy-receipt', buyHash],
        queryFn: async () => {
            if (!buyHash || !publicClient) return null
            return publicClient.getTransactionReceipt({ hash: buyHash })
        },
        enabled: !!buyHash && !!publicClient,
        refetchInterval: (query) => {
            if (query.state.data) return false
            return 2000
        },
    })

    const isBuyConfirming = !!buyHash && !buyReceipt
    const isBuySuccess = !!buyReceipt && buyReceipt.status === 'success'

    const parseTokenAddress = async (hash: Address): Promise<Address | null> => {
        if (!publicClient) return null
        try {
            const receipt = await publicClient.getTransactionReceipt({ hash })
            const args = findEventArgs<{ tokenAddr: Address }>(receipt.logs, {
                abi: getAbi('bondingCurveV1'),
                eventName: 'Creation',
                address: bondingCurveAddress,
            })
            return args?.tokenAddr ?? null
        } catch {
            return null
        }
    }

    const didTriggerBuy = useRef(false)

    useEffect(() => {
        if (!isCreateSuccess || !createHash || !bondingCurveAddress) return
        if (didTriggerBuy.current) return

        if (upfrontBuyNative > 0n) {
            didTriggerBuy.current = true
            setPhase('buying')
            parseTokenAddress(createHash).then(async (tokenAddr) => {
                if (!tokenAddr) {
                    setPhaseError(new Error('Failed to parse token address from receipt'))
                    setPhase('error')
                    return
                }
                setCreatedTokenAddress(tokenAddr)

                if (!publicClient) {
                    setPhaseError(new Error('Public client not available'))
                    setPhase('error')
                    return
                }
                const state = await getCurveState(publicClient, {
                    chainId,
                    token: tokenAddr,
                    launchpadId,
                })
                if (!state || state.tokenReserve <= 0n) {
                    setPhaseError(new Error('Token reserves not yet available'))
                    setPhase('error')
                    return
                }

                const actualExpected = computeCurve({
                    nativeReserve: state.nativeReserve,
                    tokenReserve: state.tokenReserve,
                    virtualAmount: state.virtualAmount,
                    buyAmountIn: upfrontBuyNative,
                }).buyOutput
                const actualMinOut = calculateMinOutput(actualExpected, slippageBps)

                buyParamsRef.current = {
                    tokenAddr,
                    minTokenOut: actualMinOut,
                    buyAmount: upfrontBuyNative,
                }
                writeBuy({
                    ...planCurveCall(
                        chainId,
                        {
                            kind: 'buy',
                            token: tokenAddr,
                            minOut: actualMinOut,
                            value: upfrontBuyNative,
                        },
                        launchpadId
                    ),
                    chainId: chainId,
                })
            })
        } else {
            parseTokenAddress(createHash).then((tokenAddr) => {
                setCreatedTokenAddress(tokenAddr)
            })
            setPhase('success')
        }
    }, [
        isCreateSuccess,
        createHash,
        upfrontBuyNative,
        minTokenOut,
        writeBuy,
        bondingCurveAddress,
        launchpadId,
    ])

    useEffect(() => {
        if (isBuySuccess) {
            setPhase('success')
        }
    }, [isBuySuccess])

    useEffect(() => {
        if (
            phase === 'creating' &&
            (isCreateWriteError || (createReceipt && createReceipt.status === 'reverted'))
        ) {
            setPhaseError(createWriteError ?? new Error('Create transaction reverted'))
            setPhase('error')
        }
    }, [phase, isCreateWriteError, createWriteError, createReceipt])

    useEffect(() => {
        if (
            phase === 'buying' &&
            (isBuyWriteError || (buyReceipt && buyReceipt.status === 'reverted'))
        ) {
            setPhaseError(buyWriteError ?? new Error('Buy transaction reverted'))
            setPhase('error')
        }
    }, [phase, isBuyWriteError, buyWriteError, buyReceipt])

    const create = (logoOverride?: string) => {
        if (!form || createCost === 0n || !bondingCurveAddress) return
        setPhase('creating')
        setPhaseError(null)
        setCreatedTokenAddress(null)
        didTriggerBuy.current = false
        buyParamsRef.current = null
        writeCreate({
            ...planCurveCall(
                chainId,
                {
                    kind: 'create',
                    metadata: {
                        name: form.name,
                        symbol: form.symbol,
                        logo: logoOverride ?? form.logo,
                        description: form.description,
                        link1: form.link1,
                        link2: form.link2,
                        link3: form.link3,
                    },
                    value: createCost,
                },
                launchpadId
            ),
            chainId: chainId,
        })
    }

    const isExecuting =
        (phase === 'creating' && isCreateExecuting) || (phase === 'buying' && isBuyExecuting)
    const isConfirming =
        (phase === 'creating' && isCreateConfirming) || (phase === 'buying' && isBuyConfirming)

    return {
        create,
        phase,
        isPreparing: false,
        isExecuting,
        isConfirming,
        isSuccess: phase === 'success',
        isError: phase === 'error',
        error: phaseError,
        hash: phase === 'buying' || phase === 'success' ? (buyHash ?? createHash) : createHash,
        createdTokenAddress,
        expectedTokens,
        minTokenOut,
        totalCost,
    }
}
