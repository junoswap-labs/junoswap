'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import { useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { parseEther } from 'viem'
import type { Address } from 'viem'
import {
    PUMP_CORE_NATIVE_ADDRESS,
    PUMP_CORE_NATIVE_ABI,
    PUMP_CORE_NATIVE_CHAIN_ID,
} from '@/lib/abis/pump-core-native'
import {
    calculateBuyOutput,
    calculateMinOutput,
    INITIAL_TOKEN_SUPPLY,
    parseTokenAddressFromLogs,
} from '@/services/launchpad'
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
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const [phase, setPhase] = useState<CreatePhase>('idle')
    const [createdTokenAddress, setCreatedTokenAddress] = useState<Address | null>(null)
    const [phaseError, setPhaseError] = useState<Error | null>(null)

    // Track buy params so the buy-triggering effect is stable
    const buyParamsRef = useRef<{
        tokenAddr: Address
        minTokenOut: bigint
        buyAmount: bigint
    } | null>(null)

    const { data: createFee } = useReadContract({
        address: PUMP_CORE_NATIVE_ADDRESS,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'createFee',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    const { data: initialNative } = useReadContract({
        address: PUMP_CORE_NATIVE_ADDRESS,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'initialNative',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    const { data: virtualAmount } = useReadContract({
        address: PUMP_CORE_NATIVE_ADDRESS,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'virtualAmount',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
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

    // Calculate expected buy output (uses initial reserve state)
    const expectedTokens = useMemo(() => {
        if (upfrontBuyNative <= 0n || initialNative === undefined || virtualAmount === undefined)
            return 0n
        return calculateBuyOutput(
            upfrontBuyNative,
            initialNative as bigint,
            INITIAL_TOKEN_SUPPLY,
            virtualAmount as bigint
        )
    }, [upfrontBuyNative, initialNative, virtualAmount])

    const minTokenOut = useMemo(
        () => calculateMinOutput(expectedTokens, slippageBps),
        [expectedTokens, slippageBps]
    )

    const createCost = useMemo(() => {
        if (createFee === undefined || initialNative === undefined) return 0n
        return (createFee as bigint) + (initialNative as bigint)
    }, [createFee, initialNative])

    const totalCost = useMemo(() => createCost + upfrontBuyNative, [createCost, upfrontBuyNative])

    // Transaction 1: Create Token
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

    // Transaction 2: Buy
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

    // Parse token address from creation receipt
    const parseTokenAddress = async (hash: Address): Promise<Address | null> => {
        if (!publicClient) return null
        try {
            const receipt = await publicClient.getTransactionReceipt({ hash })
            return parseTokenAddressFromLogs(receipt.logs)
        } catch {
            return null
        }
    }

    // Effect: When create succeeds, trigger buy or mark success
    const didTriggerBuy = useRef(false)

    useEffect(() => {
        if (!isCreateSuccess || !createHash) return
        if (didTriggerBuy.current) return

        if (upfrontBuyNative > 0n) {
            // Parse token address then trigger buy
            didTriggerBuy.current = true
            setPhase('buying')
            parseTokenAddress(createHash).then(async (tokenAddr) => {
                if (!tokenAddr) {
                    setPhaseError(new Error('Failed to parse token address from receipt'))
                    setPhase('error')
                    return
                }
                setCreatedTokenAddress(tokenAddr)

                // Read on-chain reserves to confirm the RPC node has indexed the block
                if (!publicClient) {
                    setPhaseError(new Error('Public client not available'))
                    setPhase('error')
                    return
                }
                const reserveData = await publicClient.readContract({
                    address: PUMP_CORE_NATIVE_ADDRESS,
                    abi: PUMP_CORE_NATIVE_ABI,
                    functionName: 'pumpReserve',
                    args: [tokenAddr],
                })
                const [nativeReserve, tokenReserve] = reserveData as [bigint, bigint]
                if (tokenReserve <= 0n) {
                    setPhaseError(new Error('Token reserves not yet available'))
                    setPhase('error')
                    return
                }

                // Recalculate minTokenOut using actual on-chain reserves
                const actualExpected = calculateBuyOutput(
                    upfrontBuyNative,
                    nativeReserve,
                    tokenReserve,
                    virtualAmount as bigint
                )
                const actualMinOut = calculateMinOutput(actualExpected, slippageBps)

                buyParamsRef.current = {
                    tokenAddr,
                    minTokenOut: actualMinOut,
                    buyAmount: upfrontBuyNative,
                }
                writeBuy({
                    address: PUMP_CORE_NATIVE_ADDRESS,
                    abi: PUMP_CORE_NATIVE_ABI,
                    functionName: 'buy',
                    args: [tokenAddr, actualMinOut],
                    value: upfrontBuyNative,
                    chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                })
            })
        } else {
            // No upfront buy — extract address and mark success
            parseTokenAddress(createHash).then((tokenAddr) => {
                setCreatedTokenAddress(tokenAddr)
            })
            setPhase('success')
        }
    }, [isCreateSuccess, createHash, upfrontBuyNative, minTokenOut, writeBuy])

    // Effect: When buy succeeds
    useEffect(() => {
        if (isBuySuccess) {
            setPhase('success')
        }
    }, [isBuySuccess])

    // Effect: Handle errors
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
            // Token was created, so mark as error but still have address
            setPhase('error')
        }
    }, [phase, isBuyWriteError, buyWriteError, buyReceipt])

    // Reset on new create call
    const create = (logoOverride?: string) => {
        if (!form || createCost === 0n) return
        setPhase('creating')
        setPhaseError(null)
        setCreatedTokenAddress(null)
        didTriggerBuy.current = false
        buyParamsRef.current = null
        writeCreate({
            address: PUMP_CORE_NATIVE_ADDRESS,
            abi: PUMP_CORE_NATIVE_ABI,
            functionName: 'createToken',
            args: [
                form.name,
                form.symbol,
                logoOverride ?? form.logo,
                form.description,
                form.link1,
                form.link2,
                form.link3,
            ],
            value: createCost,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
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
