import { parseAbiItem } from 'viem'
import type { Address, PublicClient } from 'viem'

const ERC20_TRANSFER_EVENT = parseAbiItem(
    'event Transfer(address indexed from, address indexed to, uint256 value)'
)

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

export async function fetchTokenTransferAddresses(
    publicClient: PublicClient,
    tokenAddr: Address
): Promise<Address[]> {
    const logs = await publicClient.getLogs({
        address: tokenAddr,
        event: ERC20_TRANSFER_EVENT,
        fromBlock: 0n,
        toBlock: 'latest',
    })

    const addresses = new Set<Address>()
    const zeroAddr = '0x0000000000000000000000000000000000000000'

    for (const log of logs) {
        const from = log.args.from
        const to = log.args.to
        if (from && from !== zeroAddr) addresses.add(from)
        if (to && to !== zeroAddr) addresses.add(to)
    }

    return Array.from(addresses)
}
