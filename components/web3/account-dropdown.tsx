'use client'

import { useDisconnect, useAccount, useBalance } from 'wagmi'
import { useChainId } from 'wagmi'
import { getChainMetadata, bitkub, kubTestnet } from '@/lib/wagmi'
import { formatAddress } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Jazzicon } from './jazzicon'
import { SendDialog } from './send-dialog'
import { ReferralDialog } from './referral-dialog'
import {
    Check,
    Copy,
    ExternalLink,
    LogOut,
    Sun,
    Moon,
    Send,
    Share2,
    CreditCard,
    Droplet,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import { toastSuccess } from '@/lib/toast'
import { Separator } from '@/components/ui/separator'

export function AccountDropdown({ children }: { children: React.ReactNode }) {
    const { disconnect } = useDisconnect()
    const { address } = useAccount()
    const chainId = useChainId()
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [isSendOpen, setIsSendOpen] = useState(false)
    const [isReferralOpen, setIsReferralOpen] = useState(false)
    const [copied, setCopied] = useState(false)
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
        if (!address) return
        try {
            await navigator.clipboard.writeText(address)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            /* clipboard unavailable — ignore */
        }
    }
    const handleViewOnExplorer = () => {
        if (address) {
            const explorerUrl = `${chainMeta?.explorer || 'https://etherscan.io'}/address/${address}`
            window.open(explorerUrl, '_blank', 'noopener,noreferrer')
        }
    }
    const handleBuyKub = () => {
        const url = new URL('https://checkout.banxa.com/')
        url.searchParams.set('coinType', 'KUB')
        url.searchParams.set('blockchain', 'KUB')
        url.searchParams.set('fiatType', 'THB')
        url.searchParams.set('fiatAmount', '400')
        if (address) url.searchParams.set('walletAddress', address)
        window.open(url.toString(), '_blank', 'noopener,noreferrer')
    }
    const handleFaucet = () => {
        window.open('https://faucet.kubchain.com/', '_blank', 'noopener,noreferrer')
    }
    const handleDisconnect = () => {
        disconnect()
        toastSuccess('Wallet disconnected')
    }
    return (
        <>
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
                            <button
                                type="button"
                                onClick={handleCopyAddress}
                                disabled={!address}
                                aria-label="Copy wallet address"
                                className="group flex w-full items-center gap-1.5 font-mono text-sm font-medium text-left disabled:cursor-default"
                            >
                                <span className="min-w-0 truncate">
                                    {address ? formatAddress(address) : 'Not connected'}
                                </span>
                                {address &&
                                    (copied ? (
                                        <Check
                                            className="h-3.5 w-3.5 flex-shrink-0 text-positive"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <Copy
                                            className="h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                            aria-hidden="true"
                                        />
                                    ))}
                            </button>
                            <div className="text-xs text-muted-foreground">
                                {balance
                                    ? `${Number(balance.formatted).toFixed(3)} ${balance.symbol}`
                                    : '0.000 ETH'}
                            </div>
                        </div>
                    </div>
                    <Separator />
                    <div className="p-2">
                        {chainId === bitkub.id && (
                            <>
                                <DropdownMenuItem
                                    onClick={handleBuyKub}
                                    className="flex items-center gap-3 cursor-pointer"
                                    aria-label="Buy KUB"
                                >
                                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                                    <span>Buy KUB</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        {chainId === kubTestnet.id && (
                            <>
                                <DropdownMenuItem
                                    onClick={handleFaucet}
                                    className="flex items-center gap-3 cursor-pointer"
                                    aria-label="KUB testnet faucet"
                                >
                                    <Droplet className="h-4 w-4" aria-hidden="true" />
                                    <span>Get tKUB</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem
                            onClick={handleViewOnExplorer}
                            className="flex items-center gap-3 cursor-pointer"
                            aria-label="View on block explorer"
                        >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            <span>View on explorer</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setIsSendOpen(true)}
                            className="flex items-center gap-3 cursor-pointer"
                            aria-label="Send tokens"
                        >
                            <Send className="h-4 w-4" aria-hidden="true" />
                            <span>Send</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setIsReferralOpen(true)}
                            className="flex items-center gap-3 cursor-pointer"
                            aria-label="Share referral link"
                        >
                            <Share2 className="h-4 w-4" aria-hidden="true" />
                            <span>Referral link</span>
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
            <SendDialog open={isSendOpen} onOpenChange={setIsSendOpen} />
            <ReferralDialog open={isReferralOpen} onOpenChange={setIsReferralOpen} />
        </>
    )
}
