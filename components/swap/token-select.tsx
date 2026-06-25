'use client'

import { useState } from 'react'
import { useChainId } from 'wagmi'
import type { Token } from '@/types/tokens'
import { useTokenBalances } from '@/hooks/useTokenBalance'
import { useTokenMetadata } from '@/hooks/useTokenMetadata'
import { useCustomTokensStore } from '@/store/custom-tokens-store'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { TokenIcon, TokenIconSkeleton } from '@/components/ui/token-icon'
import { EmptyState } from '@/components/ui/empty-state'
import { ChevronDown, Search, Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBalance, isValidTokenAddress } from '@/services/tokens'
import { toastSuccess } from '@/lib/toast'

function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface ImportTokenRowProps {
    address: string
    chainId: number
    onImport: (token: Token) => void
}

function ImportTokenRow({ address, chainId, onImport }: ImportTokenRowProps) {
    const { token, isLoading, isError } = useTokenMetadata(address, chainId)
    const addCustomToken = useCustomTokensStore((s) => s.addCustomToken)

    if (isLoading) {
        return (
            <div className="flex items-center gap-3 p-2">
                <TokenIconSkeleton size="sm" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
                </div>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (isError || !token) {
        return (
            <EmptyState
                title="Couldn't load token"
                description="No ERC-20 found at this address on the current network."
            />
        )
    }

    const handleImport = () => {
        addCustomToken(token)
        onImport(token)
    }

    return (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
                <TokenIcon src={token.logo} symbol={token.symbol} size="sm" />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{token.symbol}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {token.name || truncateAddress(token.address)}
                    </div>
                </div>
                <Button
                    size="sm"
                    onClick={handleImport}
                    className="rounded-lg bg-gradient-to-r from-primary to-[#FF914D] text-primary-foreground"
                >
                    Import
                </Button>
            </div>
        </div>
    )
}

interface TokenListProps {
    tokens: Token[]
    selectedToken?: Token | null
    onSelect: (token: Token) => void
}

function TokenList({ tokens, selectedToken, onSelect }: TokenListProps) {
    const chainId = useChainId()
    const {
        balances: _balances,
        rawBalances,
        isLoading: isLoadingBalances,
    } = useTokenBalances({
        tokens,
        limit: 10,
    })
    const [searchQuery, setSearchQuery] = useState('')
    const handleCopyAddress = (e: React.MouseEvent, address: string) => {
        e.stopPropagation()
        navigator.clipboard.writeText(address)
        toastSuccess('Address copied to clipboard')
    }
    const filteredTokens = tokens.filter(
        (token) =>
            token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            token.address.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const getBalance = (tokenAddress: string) => {
        if (isLoadingBalances) return '...'
        const token = tokens.find((t) => t.address === tokenAddress)
        const rawBalance = rawBalances?.[tokenAddress]
        if (token && rawBalance !== undefined) {
            return formatBalance(rawBalance, token.decimals)
        }
        return '0'
    }
    return (
        <div className="flex flex-col">
            <div className="py-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search token..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>
            <ScrollArea className="h-96">
                <div className="py-2 pr-4">
                    {filteredTokens.length === 0 ? (
                        isValidTokenAddress(searchQuery) ? (
                            <ImportTokenRow
                                address={searchQuery}
                                chainId={chainId}
                                onImport={(token) => {
                                    onSelect(token)
                                    setSearchQuery('')
                                }}
                            />
                        ) : (
                            <EmptyState title="No tokens found" />
                        )
                    ) : (
                        <div className="space-y-1">
                            {filteredTokens.map((token) => {
                                const isSelected = selectedToken?.address === token.address
                                return (
                                    <div
                                        key={token.address}
                                        role="button"
                                        tabIndex={isSelected ? -1 : 0}
                                        onClick={() => onSelect(token)}
                                        aria-disabled={isSelected}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') onSelect(token)
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 w-full p-2 rounded-xl transition-all duration-150',
                                            isSelected
                                                ? 'bg-muted/40 border border-border'
                                                : 'border border-transparent hover:bg-muted/50'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'relative flex-shrink-0',
                                                isSelected && 'ring-2 ring-border rounded-full'
                                            )}
                                        >
                                            <TokenIcon
                                                src={token.logo}
                                                symbol={token.symbol}
                                                size="sm"
                                            />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div
                                                className={cn(
                                                    'text-sm',
                                                    isSelected
                                                        ? 'font-semibold text-foreground'
                                                        : 'font-medium'
                                                )}
                                            >
                                                {token.symbol}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <span className="font-mono">
                                                    {truncateAddress(token.address)}
                                                </span>
                                                <button
                                                    onClick={(e) =>
                                                        handleCopyAddress(e, token.address)
                                                    }
                                                    className="hover:text-foreground"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {getBalance(token.address)}
                                        </span>
                                        {isSelected && (
                                            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-foreground/10">
                                                <Check className="h-3 w-3 text-foreground" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

interface TokenSelectProps {
    token: Token | null
    tokens: Token[]
    onSelect: (token: Token) => void
    className?: string
}

export function TokenSelect({ token, tokens, onSelect, className }: TokenSelectProps) {
    const [open, setOpen] = useState(false)
    const handleSelect = (selectedToken: Token) => {
        onSelect(selectedToken)
        setOpen(false)
    }
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'min-w-32 h-10 justify-start px-3 rounded-xl',
                        !token && 'text-muted-foreground',
                        className
                    )}
                >
                    {token ? (
                        <div className="flex items-center gap-2">
                            <TokenIcon src={token.logo} symbol={token.symbol} size="xs" />
                            <span className="font-medium">{token.symbol}</span>
                        </div>
                    ) : (
                        'Select'
                    )}
                    <ChevronDown className="ml-auto h-5 w-5 opacity-50" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select a token</DialogTitle>
                </DialogHeader>
                <TokenList tokens={tokens} selectedToken={token} onSelect={handleSelect} />
            </DialogContent>
        </Dialog>
    )
}
