'use client'

import { getStakerAbi, getStakerAddress, type EarnProgram } from '@/lib/earn-programs'
import { useCallback, useMemo } from 'react'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { zeroAddress, type Address } from 'viem'
import { useUserPositions } from '@/hooks/useUserPositions'
import type { PositionWithTokens } from '@/types/earn'

export interface StakerDeposit {
    position: PositionWithTokens
    /** The wallet that deposited the NFT, which is who may unstake and withdraw it. */
    depositor: Address
    /** Which staker is holding it — the two run side by side. */
    program: EarnProgram
    /** On-chain count of farms it is staked in; `withdrawToken` reverts unless this is 0. */
    numberOfStakes: number
}

/**
 * Every position currently held by the staker, paired with the wallet that put it there.
 *
 * Depositing transfers the NFT to the staker, so the indexer may list such a position under the
 * staker, under its original wallet, or both depending on how it tracks ownership. Candidates are
 * taken from both sides and then confirmed on-chain with `deposits()`, which is the only
 * authoritative answer to "is this in the staker, and whose is it".
 */
export function useStakerDeposits(): {
    deposits: StakerDeposit[]
    isLoading: boolean
    refetch: () => void
} {
    const uniswap = useStakerDepositsFor('v3')
    const juno = useStakerDepositsFor('juno-v3')
    const deposits = useMemo(
        () => [...uniswap.deposits, ...juno.deposits],
        [uniswap.deposits, juno.deposits]
    )
    const refetch = useCallback(() => {
        uniswap.refetch()
        juno.refetch()
    }, [uniswap, juno])
    return { deposits, isLoading: uniswap.isLoading || juno.isLoading, refetch }
}

function useStakerDepositsFor(program: EarnProgram): {
    deposits: StakerDeposit[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const { address } = useAccount()
    const stakerAddress = getStakerAddress(chainId, program)

    const stakerHeld = useUserPositions(stakerAddress, chainId)
    const walletHeld = useUserPositions(address, chainId)

    const candidates = useMemo(() => {
        const byTokenId = new Map<string, PositionWithTokens>()
        for (const position of stakerHeld.positions) {
            byTokenId.set(position.tokenId.toString(), position)
        }
        for (const position of walletHeld.positions) {
            const key = position.tokenId.toString()
            if (!byTokenId.has(key)) byTokenId.set(key, position)
        }
        return Array.from(byTokenId.values())
    }, [stakerHeld.positions, walletHeld.positions])

    const contracts = useMemo(() => {
        if (!stakerAddress) return []
        return candidates.map((position) => ({
            address: stakerAddress,
            abi: getStakerAbi(program),
            functionName: 'deposits' as const,
            args: [position.tokenId] as const,
            chainId,
        }))
    }, [candidates, stakerAddress, program, chainId])

    const {
        data,
        isLoading: isLoadingDeposits,
        refetch: refetchDeposits,
    } = useReadContracts({
        contracts,
        query: { enabled: contracts.length > 0, staleTime: 15_000 },
    })

    const deposits = useMemo(() => {
        const result: StakerDeposit[] = []
        candidates.forEach((position, index) => {
            const row = data?.[index]?.result as
                | readonly [Address, number, number, number]
                | undefined
            const depositor = row?.[0]
            if (!depositor || depositor === zeroAddress) return
            result.push({ position, depositor, program, numberOfStakes: Number(row[1]) })
        })
        return result
    }, [candidates, data, program])

    const refetch = useCallback(() => {
        void stakerHeld.refetch()
        void walletHeld.refetch()
        void refetchDeposits()
    }, [stakerHeld, walletHeld, refetchDeposits])

    return {
        deposits,
        isLoading: stakerHeld.isLoading || walletHeld.isLoading || isLoadingDeposits,
        refetch,
    }
}
