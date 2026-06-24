'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useChainId, usePublicClient, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getV3StakerAddress } from '@/lib/dex-config'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import {
    getStakedTokenIds,
    addStakedTokenId,
    removeStakedTokenId,
    setStakedTokenIds,
    hasStoredTokenIds,
} from '@/lib/staked-positions-storage'

interface UseDepositedTokenIdsResult {
    tokenIds: bigint[]
    isLoading: boolean
    addTokenId: (tokenId: bigint) => void
    removeTokenId: (tokenId: bigint) => void
    refetch: () => void
}

export function useDepositedTokenIds(
    owner: Address | undefined,
    refreshKey?: number
): UseDepositedTokenIdsResult {
    const chainId = useChainId()
    const publicClient = usePublicClient()
    const stakerAddress = getV3StakerAddress(chainId)
    const [localTokenIds, setLocalTokenIds] = useState<bigint[]>([])
    const [eventTokenIds, setEventTokenIds] = useState<bigint[]>([])
    const [isLoadingEvents, setIsLoadingEvents] = useState(false)
    const [hasCheckedStorage, setHasCheckedStorage] = useState(false)
    const [needsEventFallback, setNeedsEventFallback] = useState(false)
    useEffect(() => {
        if (!owner || !chainId) {
            setLocalTokenIds([])
            setHasCheckedStorage(true)
            return
        }
        const stored = getStakedTokenIds(chainId, owner)
        setLocalTokenIds(stored)
        setHasCheckedStorage(true)
        if (!hasStoredTokenIds(chainId, owner)) {
            setNeedsEventFallback(true)
        }
        // refreshKey re-reads storage after a stake/unstake mutates it elsewhere.
    }, [owner, chainId, refreshKey])
    useEffect(() => {
        if (!needsEventFallback || !owner || !stakerAddress || !publicClient) {
            return
        }
        async function fetchFromEvents() {
            if (!owner || !stakerAddress || !publicClient) return
            setIsLoadingEvents(true)
            try {
                const logs = await publicClient.getContractEvents({
                    address: stakerAddress,
                    abi: UNISWAP_V3_STAKER_ABI,
                    eventName: 'DepositTransferred',
                    args: {
                        newOwner: owner,
                    },
                    fromBlock: 'earliest',
                    toBlock: 'latest',
                })
                const tokenIdSet = new Set<string>()
                for (const log of logs) {
                    const tokenId = log.args.tokenId
                    if (tokenId !== undefined) {
                        tokenIdSet.add(tokenId.toString())
                    }
                }
                const tokenIds = Array.from(tokenIdSet).map((id) => BigInt(id))
                setEventTokenIds(tokenIds)
            } catch (error) {
                console.error('Failed to fetch deposit events:', error)
            } finally {
                setIsLoadingEvents(false)
            }
        }
        fetchFromEvents()
    }, [needsEventFallback, owner, stakerAddress, publicClient])
    const candidateTokenIds = useMemo(() => {
        const combined = new Set<string>()
        localTokenIds.forEach((id) => combined.add(id.toString()))
        eventTokenIds.forEach((id) => combined.add(id.toString()))
        return Array.from(combined).map((id) => BigInt(id))
    }, [localTokenIds, eventTokenIds])
    const depositContracts = useMemo(() => {
        if (!stakerAddress || candidateTokenIds.length === 0) return []
        return candidateTokenIds.map((tokenId) => ({
            address: stakerAddress,
            abi: UNISWAP_V3_STAKER_ABI,
            functionName: 'deposits' as const,
            args: [tokenId] as const,
            chainId,
        }))
    }, [stakerAddress, candidateTokenIds, chainId])
    const {
        data: depositData,
        isLoading: isLoadingDeposits,
        refetch: refetchDeposits,
    } = useReadContracts({
        contracts: depositContracts,
        query: {
            enabled: depositContracts.length > 0 && !!owner,
            staleTime: 15_000,
        },
    })
    const validatedTokenIds = useMemo(() => {
        if (!depositData || !owner) return []
        const validated: bigint[] = []
        candidateTokenIds.forEach((tokenId, index) => {
            const result = depositData[index]?.result as
                | [Address, number, number, number]
                | undefined
            if (result && result[0].toLowerCase() === owner.toLowerCase()) {
                validated.push(tokenId)
            }
        })
        if (validated.length > 0 && owner && chainId) {
            setStakedTokenIds(chainId, owner, validated)
        }
        return validated
    }, [depositData, candidateTokenIds, owner, chainId])
    const addTokenId = useCallback(
        (tokenId: bigint) => {
            if (!owner || !chainId) return
            addStakedTokenId(chainId, owner, tokenId)
            setLocalTokenIds((prev) => {
                if (prev.some((id) => id === tokenId)) return prev
                return [...prev, tokenId]
            })
        },
        [owner, chainId]
    )
    const removeTokenId = useCallback(
        (tokenId: bigint) => {
            if (!owner || !chainId) return
            removeStakedTokenId(chainId, owner, tokenId)
            setLocalTokenIds((prev) => prev.filter((id) => id !== tokenId))
        },
        [owner, chainId]
    )
    const refetch = useCallback(() => {
        refetchDeposits()
    }, [refetchDeposits])
    // Re-validate on-chain when refreshKey bumps; the candidate set may be unchanged
    // (e.g. unstake) yet the deposits() owner has flipped.
    useEffect(() => {
        if (refreshKey === undefined || refreshKey === 0) return
        refetchDeposits()
    }, [refreshKey, refetchDeposits])
    const isLoading = !hasCheckedStorage || isLoadingEvents || isLoadingDeposits
    return {
        tokenIds: validatedTokenIds,
        isLoading,
        addTokenId,
        removeTokenId,
        refetch,
    }
}
