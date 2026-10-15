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
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import {
    encodeIncentiveKeyData,
    buildUnstakeAndClaimMulticall,
    buildWithdrawMulticall,
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
    program: EarnProgram,
    /** The NFT already sits in this program's staker, so it is staked in place, not transferred. */
    deposited = false
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
    const dexConfig = getDexes(chainId, 'v3')[0]
    const stakerAddress = getStakerAddress(chainId, program)
    const positionManager = dexConfig?.positionManager
    const isEnabled =
        !!position && !!incentiveKey && !!owner && !!stakerAddress && !!positionManager
    const { data: approvedAddress } = useReadContract({
        address: positionManager,
        abi: getAbi('positionManager'),
        functionName: 'getApproved',
        args: position ? [position.tokenId] : undefined,
        query: { enabled: !!position && !!positionManager },
    })
    const { data: isApprovedForAll } = useReadContract({
        address: positionManager,
        abi: getAbi('positionManager'),
        functionName: 'isApprovedForAll',
        args: owner && stakerAddress ? [owner, stakerAddress] : undefined,
        query: { enabled: !!owner && !!stakerAddress && !!positionManager },
    })
    const needsApproval =
        !deposited &&
        !isApprovedForAll &&
        approvedAddress?.toLowerCase() !== stakerAddress?.toLowerCase()
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
    const transferSim = useSimulateContract({
        ...stakeCallData!,
        query: {
            enabled: isEnabled && !deposited && !!stakeCallData && (!needsApproval || justApproved),
        },
    })
    // A deposit is already inside the staker: only the stake call is left, and it needs no approval.
    const inPlaceSim = useSimulateContract({
        address: stakerAddress,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'stakeToken',
        args:
            incentiveKey && position
                ? [
                      {
                          rewardToken: incentiveKey.rewardToken,
                          pool: incentiveKey.pool,
                          startTime: BigInt(incentiveKey.startTime),
                          endTime: BigInt(incentiveKey.endTime),
                          refundee: incentiveKey.refundee,
                      },
                      position.tokenId,
                  ]
                : undefined,
        query: { enabled: isEnabled && deposited },
    })
    const activeSim = deposited ? inPlaceSim : transferSim
    const isSimulating = activeSim.isLoading
    const simulationError = activeSim.error
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
        if (deposited) {
            if (inPlaceSim.data?.request) writeContract(inPlaceSim.data.request)
        } else if (transferSim.data?.request) {
            writeContract(transferSim.data.request)
        }
    }, [deposited, inPlaceSim.data, transferSim.data, writeContract])
    const approveAndStake = useCallback(() => {
        if (!positionManager || !stakerAddress || !position) return
        writeContract({
            address: positionManager,
            abi: getAbi('positionManager'),
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

interface StakerCall {
    run: () => void
    /** A simulation the call can be sent from, so a step can wait for it before auto-running. */
    canRun: boolean
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    error: Error | null
    simulationError: Error | null
    hash: `0x${string}` | undefined
}

function useStakerMulticall(
    stakerAddress: Address | undefined,
    data: readonly `0x${string}`[] | null,
    enabled: boolean
): StakerCall {
    const isEnabled = enabled && !!stakerAddress && !!data && data.length > 0
    const {
        data: simulation,
        isLoading: isSimulating,
        error: simulationError,
        refetch,
    } = useSimulateContract({
        address: stakerAddress,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'multicall',
        args: data ? [data] : undefined,
        // The withdraw simulates right after the unstake lands, and the RPC can lag a block
        // behind it. A few spaced retries absorb that instead of failing the step.
        query: { enabled: isEnabled, retry: 3, retryDelay: 1_000 },
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
    const run = useCallback(() => {
        if (simulation?.request) writeContract(simulation.request)
        else refetch()
    }, [simulation, writeContract, refetch])
    return {
        run,
        canRun: !!simulation?.request,
        isPreparing: isEnabled && isSimulating,
        isExecuting,
        isConfirming,
        isSuccess,
        error: writeError || receiptError || null,
        simulationError: isEnabled ? (simulationError as Error | null) : null,
        hash,
    }
}

/**
 * Takes positions out of a farm in two signatures: unstake and claim first, so the rewards are
 * paid out as their own step, then withdraw the NFTs once that has landed.
 */
export function useUnstakeAndWithdraw(
    tokenIds: readonly bigint[],
    incentiveKey: IncentiveKey | null,
    recipient: Address | undefined,
    program: EarnProgram
): { unstake: StakerCall; withdraw: StakerCall } {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const unstakeData = useMemo(
        () =>
            incentiveKey && recipient
                ? buildUnstakeAndClaimMulticall(tokenIds, incentiveKey, recipient)
                : null,
        [tokenIds, incentiveKey, recipient]
    )
    const withdrawData = useMemo(
        () => (recipient ? buildWithdrawMulticall(tokenIds, recipient) : null),
        [tokenIds, recipient]
    )
    const unstake = useStakerMulticall(stakerAddress, unstakeData, true)
    const withdraw = useStakerMulticall(stakerAddress, withdrawData, unstake.isSuccess)
    return { unstake, withdraw }
}
