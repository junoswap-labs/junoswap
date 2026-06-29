import type { Address } from 'viem'

export interface SwapEventData {
    blockNumber: bigint
    timestamp: number
    sender: Address
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    transactionHash: `0x${string}`
    tokenAddr: Address
}

export interface HolderData {
    address: Address
    balance: bigint
    percentage: number
}
