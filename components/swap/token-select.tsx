'use client'

import { useState, useEffect, useMemo } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { isAddress } from 'viem'
import type { Address } from 'viem'
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
import { TokenIcon } from '@/components/ui/token-icon'
import { UnknownTokenIcon } from '@/components/ui/token-icon-unknown'
import { EmptyState } from '@/components/ui/empty-state'
import { ChevronDown, Search, Copy, Check, Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBalance } from '@/services/tokens'
import { toastSuccess } from '@/lib/toast'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { getCustomTokens, saveCustomToken, removeCustomToken } from '@/lib/custom-tokens'

function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// ── Inner list ────────────────────────────────────────────────────────────────

interface TokenListProps {
    tokens: Token[]
    customAddresses: Set<string>
    selectedToken?: Token | null
    onSelect: (token: Token) => void
    onRemoveCustom: (token: Token) => void
}

function TokenList({
    tokens,
    customAddresses,
    selectedToken,
    onSelect,
    onRemoveCustom,
}: TokenListProps) {
    const { rawBalances, isLoading: isLoadingBalances } = useTokenBalances({ tokens, limit: 10 })
    const [searchQuery, setSearchQuery] = useState('')
    const chainId = useChainId()

    const isAddressSearch = isAddress(searchQuery.trim())

    const filteredTokens = useMemo(
        () =>
            tokens.filter(
                (token) =>
                    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    token.address.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [tokens, searchQuery]
    )

    const notFound = filteredTokens.length === 0 && isAddressSearch
    const importAddress = notFound ? (searchQuery.trim() as Address) : null

    // Fetch on-chain info when address not in list
    const { data: contractData, isFetching: isFetchingContract } = useReadContracts({
        contracts: [
            { address: importAddress ?? '0x0', abi: ERC20_ABI, functionName: 'symbol', chainId },
            { address: importAddress ?? '0x0', abi: ERC20_ABI, functionName: 'name', chainId },
            { address: importAddress ?? '0x0', abi: ERC20_ABI, functionName: 'decimals', chainId },
        ],
        query: { enabled: !!importAddress },
    })

    const fetchedSymbol = contractData?.[0]?.result as string | undefined
    const fetchedName = contractData?.[1]?.result as string | undefined
    const fetchedDecimals = contractData?.[2]?.result as number | undefined
    const isFetchReady = !!fetchedSymbol && fetchedDecimals !== undefined

    function handleImport() {
        if (!importAddress || !isFetchReady) return
        const token: Token = {
            address: importAddress,
            symbol: fetchedSymbol!,
            name: fetchedName ?? fetchedSymbol!,
            decimals: fetchedDecimals!,
            chainId,
        }
        saveCustomToken(token)
        toastSuccess(`${token.symbol} added`)
        onSelect(token)
    }

    const handleCopyAddress = (e: React.MouseEvent, address: string) => {
        e.stopPropagation()
        navigator.clipboard.writeText(address)
        toastSuccess('Address copied to clipboard')
    }

    const getBalance = (tokenAddress: string) => {
        if (isLoadingBalances) return '...'
        const token = tokens.find((t) => t.address === tokenAddress)
        const rawBalance = rawBalances?.[tokenAddress]
        if (token && rawBalance !== undefined) return formatBalance(rawBalance, token.decimals)
        return '0'
    }

    return (
        <div className="flex flex-col">
            <div className="py-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name or paste address…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            <ScrollArea className="h-96">
                <div className="py-2 pr-4 space-y-1">
                    {/* Import prompt when address not in list */}
                    {importAddress && (
                        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                            {isFetchingContract ? (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Looking up token…
                                </p>
                            ) : isFetchReady ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <UnknownTokenIcon size="sm" />
                                        <div>
                                            <p className="text-sm font-semibold">{fetchedSymbol}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {fetchedName} · {fetchedDecimals} dec
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={handleImport}
                                        className="shrink-0 gap-1.5"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add {fetchedSymbol}
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-sm text-destructive">
                                    No ERC-20 token found at this address
                                </p>
                            )}
                        </div>
                    )}

                    {/* Token list */}
                    {filteredTokens.length === 0 && !importAddress ? (
                        <EmptyState title="No tokens found" />
                    ) : (
                        filteredTokens.map((token) => {
                            const isSelected = selectedToken?.address === token.address
                            const isCustom = customAddresses.has(token.address.toLowerCase())
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
                                        {isCustom ? (
                                            <UnknownTokenIcon size="sm" />
                                        ) : (
                                            <TokenIcon
                                                src={token.logo}
                                                symbol={token.symbol}
                                                size="sm"
                                            />
                                        )}
                                    </div>

                                    <div className="flex-1 text-left min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={cn(
                                                    'text-sm',
                                                    isSelected
                                                        ? 'font-semibold text-foreground'
                                                        : 'font-medium'
                                                )}
                                            >
                                                {token.symbol}
                                            </span>
                                            {isCustom && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onRemoveCustom(token)
                                                    }}
                                                    className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Remove ${token.symbol}`}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <span className="font-mono">
                                                {truncateAddress(token.address)}
                                            </span>
                                            <button
                                                onClick={(e) => handleCopyAddress(e, token.address)}
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
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

// ── TokenSelect (main export) ─────────────────────────────────────────────────

interface TokenSelectProps {
    token: Token | null
    tokens: Token[]
    onSelect: (token: Token) => void
    className?: string
}

export function TokenSelect({ token, tokens, onSelect, className }: TokenSelectProps) {
    const chainId = useChainId()
    const [open, setOpen] = useState(false)
    const [customTokens, setCustomTokens] = useState<Token[]>([])

    useEffect(() => {
        if (open) setCustomTokens(getCustomTokens(chainId))
    }, [open, chainId])

    // Merge: chain tokens first, then custom tokens not already in list
    const mergedTokens = useMemo(() => {
        const customNew = customTokens.filter(
            (c) => !tokens.some((t) => t.address.toLowerCase() === c.address.toLowerCase())
        )
        return [...tokens, ...customNew]
    }, [tokens, customTokens])

    const customAddresses = useMemo(
        () => new Set(customTokens.map((t) => t.address.toLowerCase())),
        [customTokens]
    )

    function handleSelect(selected: Token) {
        onSelect(selected)
        setOpen(false)
    }

    function handleRemoveCustom(t: Token) {
        removeCustomToken(chainId, t.address)
        setCustomTokens(getCustomTokens(chainId))
        if (token?.address === t.address) onSelect(null as unknown as Token)
    }

    const isCustomToken = token && customAddresses.has(token.address.toLowerCase())

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
                            {isCustomToken ? (
                                <UnknownTokenIcon size="xs" />
                            ) : (
                                <TokenIcon src={token.logo} symbol={token.symbol} size="xs" />
                            )}
                            <span className="font-medium">{token.symbol}</span>
                        </div>
                    ) : (
                        'Select token'
                    )}
                    <ChevronDown className="ml-auto h-5 w-5 opacity-50" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select a token</DialogTitle>
                </DialogHeader>
                <TokenList
                    tokens={mergedTokens}
                    customAddresses={customAddresses}
                    selectedToken={token}
                    onSelect={handleSelect}
                    onRemoveCustom={handleRemoveCustom}
                />
            </DialogContent>
        </Dialog>
    )
}
