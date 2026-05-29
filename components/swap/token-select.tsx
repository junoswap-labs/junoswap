'use client'

import { useState } from 'react'
import type { Token } from '@/types/tokens'
import { useTokenBalances } from '@/hooks/useTokenBalance'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { ChevronDown, Search, Copy, SearchX, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBalance } from '@/services/tokens'
import { toastSuccess } from '@/lib/toast'

function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface TokenListProps {
    tokens: Token[]
    selectedToken?: Token | null
    onSelect: (token: Token) => void
}

function TokenList({ tokens, selectedToken, onSelect }: TokenListProps) {
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
                        <EmptyState icon={SearchX} title="No tokens found" compact />
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
                                                'relative h-8 w-8 flex-shrink-0 rounded-full',
                                                isSelected && 'ring-2 ring-border'
                                            )}
                                        >
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={token.logo} alt={token.symbol} />
                                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                    {token.symbol.charAt(0)}
                                                </AvatarFallback>
                                            </Avatar>
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
                            {token.logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={token.logo}
                                    alt={token.symbol}
                                    className="h-6 w-6 rounded-full object-cover"
                                />
                            )}
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
