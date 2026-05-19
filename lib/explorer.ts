import { getChainMetadata } from '@/lib/wagmi'

export function getExplorerTxUrl(chainId: number, txHash: string): string {
    const meta = getChainMetadata(chainId)
    return `${meta?.explorer}/tx/${txHash}`
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
    const meta = getChainMetadata(chainId)
    return `${meta?.explorer}/address/${address}`
}

export function getExplorerTokenUrl(chainId: number, address: string): string {
    const meta = getChainMetadata(chainId)
    return `${meta?.explorer}/token/${address}`
}
