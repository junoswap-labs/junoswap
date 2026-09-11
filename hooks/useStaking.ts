'use client'

import { getStakerAddress, type EarnProgram } from '@/lib/earn-programs'
import { useMemo, useCallback, useState, useEffect } from 'react'
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSimulateContract,
    useChainId,
    useReadContract,
} from 'wagmi'
import type { Address } from 'viem'
import type { IncentiveKey, PositionWithTokens } from '@/types/earn'
import {
    ProtocolType,
    getDexConfig,
    NONFUNGIBLE_POSITION_MANAGER_ABI,
} from '@coshi190/juno-moneta-sdk'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import {
    encodeIncentiveKeyData,
    buildUnstakeAndWithdrawMulticall,
    buildUnstakeAndClaimMulticall,
    buildUnstakeManyAndWithdrawMulticall,
} from '@/services/mining/staking'
const SAFE_TRANSFER_FROM_ABI = [
    {
        type: 'function',
        name: 'safeTransferFrom',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },
] as const

export function useStakePosition(
    position: PositionWithTokens | null,
    incentiveKey: IncentiveKey | null,
    owner: Address | undefined,
    program: EarnProgram
): {
    stake: () => void
    approveAndStake: () => void
    needsApproval: boolean
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const dexConfig = getDexConfig(chainId, undefined, ProtocolType.V3)
    const stakerAddress = getStakerAddress(chainId, program)
    const positionManager = dexConfig?.positionManager
    const isEnabled =
        !!position && !!incentiveKey && !!owner && !!stakerAddress && !!positionManager
    const { data: approvedAddress } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'getApproved',
        args: position ? [position.tokenId] : undefined,
        query: { enabled: !!position && !!positionManager },
    })
    const { data: isApprovedForAll } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'isApprovedForAll',
        args: owner && stakerAddress ? [owner, stakerAddress] : undefined,
        query: { enabled: !!owner && !!stakerAddress && !!positionManager },
    })
    const needsApproval =
        !isApprovedForAll && approvedAddress?.toLowerCase() !== stakerAddress?.toLowerCase()
    const [justApproved, setJustApproved] = useState(false)
    const stakeCallData = useMemo(() => {
        if (!position || !incentiveKey || !stakerAddress || !positionManager || !owner) {
            return null
        }
        const data = encodeIncentiveKeyData(incentiveKey)
        return {
            address: positionManager as Address,
            abi: SAFE_TRANSFER_FROM_ABI,
            functionName: 'safeTransferFrom' as const,
            args: [owner, stakerAddress, position.tokenId, data] as const,
        }
    }, [position, incentiveKey, stakerAddress, positionManager, owner])
    const {
        data: stakeSimulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        ...stakeCallData!,
        query: {
            enabled: isEnabled && !!stakeCallData && (!needsApproval || justApproved),
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
    } = useWaitForTransactionReceipt({ hash })
    useEffect(() => {
        if (isSuccess && hash && needsApproval) {
            setJustApproved(true)
        }
    }, [isSuccess, hash, needsApproval])
    useEffect(() => {
        setJustApproved(false)
    }, [position?.tokenId, incentiveKey?.rewardToken, owner])
    useEffect(() => {
        if (isSuccess && hash && !needsApproval) {
            setJustApproved(false)
        }
    }, [isSuccess, hash, needsApproval])
    const stake = useCallback(() => {
        if (!stakeSimulation?.request) return
        writeContract(stakeSimulation.request)
    }, [stakeSimulation, writeContract])
    const approveAndStake = useCallback(() => {
        if (!positionManager || !stakerAddress || !position) return
        writeContract({
            address: positionManager,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'approve',
            args: [stakerAddress, position.tokenId],
        })
    }, [positionManager, stakerAddress, position, writeContract])
    return {
        stake,
        approveAndStake,
        needsApproval,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (simulationError as Error | null),
        hash,
    }
}

/**
 * Unstakes and withdraws several positions from one farm in a single transaction. A wallet with
 * three positions in a farm should not have to sign three times to get them all back.
 */
export function useUnstakePositions(
    tokenIds: readonly bigint[],
    incentiveKey: IncentiveKey | null,
    recipient: Address | undefined,
    program: EarnProgram
): {
    unstake: () => void
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const multicallData = useMemo(() => {
        if (!incentiveKey || !recipient || tokenIds.length === 0) return null
        return buildUnstakeManyAndWithdrawMulticall(tokenIds, incentiveKey, recipient)
    }, [tokenIds, incentiveKey, recipient])
    const isEnabled = !!stakerAddress && !!multicallData
    const {
        data: simulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: stakerAddress,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'multicall',
        args: multicallData ? [multicallData] : undefined,
        query: { enabled: isEnabled },
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
    } = useWaitForTransactionReceipt({ hash })
    const unstake = useCallback(() => {
        if (!simulation?.request) return
        writeContract(simulation.request)
    }, [simulation, writeContract])
    return {
        unstake,
        isPreparing: isEnabled && isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (isEnabled ? (simulationError as Error | null) : null),
        hash,
    }
}

/**
 * Pulls an NFT back out of the staker. A position that was transferred in but is staked in nothing
 * earns no rewards and cannot be moved, so this is the exit for a deposit left behind.
 */
export function useWithdrawPosition(
    tokenId: bigint | undefined,
    recipient: Address | undefined,
    program: EarnProgram
): {
    withdraw: () => void
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const isEnabled = tokenId !== undefined && !!recipient && !!stakerAddress
    const {
        data: simulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: stakerAddress,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'withdrawToken',
        args: isEnabled ? [tokenId, recipient, '0x'] : undefined,
        query: { enabled: isEnabled },
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
    } = useWaitForTransactionReceipt({ hash })
    const withdraw = useCallback(() => {
        if (!simulation?.request) return
        writeContract(simulation.request)
    }, [simulation, writeContract])
    return {
        withdraw,
        isPreparing: isEnabled && isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (isEnabled ? (simulationError as Error | null) : null),
        hash,
    }
}

export function useUnstakePosition(
    tokenId: bigint | undefined,
    incentiveKey: IncentiveKey | null,
    recipient: Address | undefined,
    program: EarnProgram,
    withdrawAfterUnstake: boolean = true
): {
    unstake: () => void
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    hash: `0x${string}` | undefined
} {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const isEnabled = tokenId !== undefined && !!incentiveKey && !!recipient && !!stakerAddress
    const multicallData = useMemo(() => {
        if (!isEnabled || !incentiveKey || !recipient || tokenId === undefined) {
            return null
        }
        if (withdrawAfterUnstake) {
            return buildUnstakeAndWithdrawMulticall(tokenId, incentiveKey, recipient)
        }
        return buildUnstakeAndClaimMulticall(tokenId, incentiveKey, recipient)
    }, [tokenId, incentiveKey, recipient, withdrawAfterUnstake, isEnabled])
    const {
        data: unstakeSimulation,
        isLoading: isSimulating,
        error: simulationError,
    } = useSimulateContract({
        address: stakerAddress!,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'multicall',
        args: multicallData ? [multicallData] : undefined,
        query: {
            enabled: isEnabled && !!multicallData,
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
    } = useWaitForTransactionReceipt({ hash })
    const unstake = useCallback(() => {
        if (!unstakeSimulation?.request) return
        writeContract(unstakeSimulation.request)
    }, [unstakeSimulation, writeContract])
    return {
        unstake,
        isPreparing: isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || (simulationError as Error | null),
        hash,
    }
}
