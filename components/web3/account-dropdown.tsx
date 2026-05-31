'use client'

import { useDisconnect, useAccount, useBalance } from 'wagmi'
import { useChainId } from 'wagmi'
import { getChainMetadata } from '@/lib/wagmi'
import { formatAddress } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Jazzicon } from './jazzicon'
import { Copy, ExternalLink, LogOut, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import { toastSuccess, toastError } from '@/lib/toast'
import { Separator } from '@/components/ui/separator'

export function AccountDropdown({ children }: { children: React.ReactNode }) {
    const { disconnect } = useDisconnect()
    const { address } = useAccount()
    const chainId = useChainId()
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])
    const { data: balance } = useBalance({
        address: address as `0x${string}`,
        query: {
            enabled: !!address,
        },
    })
    const chainMeta = getChainMetadata(chainId)
    const handleCopyAddress = async () => {
        if (address) {
            try {
                await navigator.clipboard.writeText(address)
                toastSuccess('Address copied')
            } catch {
                toastError('Failed to copy address')
            }
        }
    }
    const handleViewOnExplorer = () => {
        if (address) {
            const explorerUrl = `${chainMeta?.explorer || 'https://etherscan.io'}/address/${address}`
            window.open(explorerUrl, '_blank', 'noopener,noreferrer')
        }
    }
    const handleDisconnect = () => {
        disconnect()
        toastSuccess('Wallet disconnected')
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-64 bg-card/95 backdrop-blur-md border-border/50"
            >
                <div className="flex items-center gap-2.5 px-3 py-3">
                    <Jazzicon
                        address={address || ''}
                        size={32}
                        className="flex-shrink-0 overflow-hidden rounded-full [&>div]:rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-medium truncate">
                            {address ? formatAddress(address) : 'Not connected'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {balance
                                ? `${Number(balance.formatted).toFixed(3)} ${balance.symbol}`
                                : '0.000 ETH'}
                        </div>
                    </div>
                </div>
                <Separator />
                <div className="p-2">
                    <DropdownMenuItem
                        onClick={handleCopyAddress}
                        className="flex items-center gap-3 cursor-pointer"
                        aria-label="Copy wallet address"
                    >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        <span>Copy address</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={handleViewOnExplorer}
                        className="flex items-center gap-3 cursor-pointer"
                        aria-label="View on block explorer"
                    >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span>View on explorer</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {mounted && (
                        <div className="flex items-center justify-between px-2 py-1.5">
                            <span className="text-sm">Theme</span>
                            <button
                                onClick={() =>
                                    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                                }
                                className="relative inline-flex items-center rounded-full bg-muted p-1 gap-1"
                                aria-label="Toggle theme"
                            >
                                <span
                                    className={`relative z-10 w-6 h-6 flex items-center justify-center ${resolvedTheme === 'dark' ? '' : 'text-muted-foreground/40'}`}
                                >
                                    <Moon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span
                                    className={`relative z-10 w-6 h-6 flex items-center justify-center ${resolvedTheme === 'dark' ? 'text-muted-foreground/40' : ''}`}
                                >
                                    <Sun className="h-4 w-4" aria-hidden="true" />
                                </span>
                            </button>
                        </div>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={handleDisconnect}
                        className="flex items-center gap-3 cursor-pointer"
                        aria-label="Disconnect wallet"
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        <span>Disconnect</span>
                    </DropdownMenuItem>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
