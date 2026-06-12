'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { supportedChains, getChainMetadata, kubTestnet } from '@/lib/wagmi'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronDown, Search, Check } from 'lucide-react'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

const TESTNET_IDS: Set<number> = new Set([kubTestnet.id])

interface NetworkSwitcherModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function NetworkSwitcherModal({ open, onOpenChange }: NetworkSwitcherModalProps) {
    const chainId = useChainId()
    const { switchChain } = useSwitchChain()
    const [searchQuery, setSearchQuery] = useState('')
    const [pendingChainId, setPendingChainId] = useState<number | null>(null)

    const { mainnets, testnets } = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()

        const matches = (chain: (typeof supportedChains)[number]) => {
            const meta = getChainMetadata(chain.id)
            if (!meta) return false
            if (!query) return true
            return (
                meta.name.toLowerCase().includes(query) || meta.symbol.toLowerCase().includes(query)
            )
        }

        return {
            mainnets: supportedChains.filter((c) => matches(c) && !TESTNET_IDS.has(c.id)),
            testnets: supportedChains.filter((c) => matches(c) && TESTNET_IDS.has(c.id)),
        }
    }, [searchQuery])

    const hasResults = mainnets.length > 0 || testnets.length > 0

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
            setSearchQuery('')
            setPendingChainId(null)
        }
    }

    const handleSwitchChain = (targetChainId: number) => {
        if (targetChainId === chainId) return
        setPendingChainId(targetChainId)
        switchChain(
            { chainId: targetChainId },
            {
                onSuccess: () => {
                    const meta = getChainMetadata(targetChainId)
                    toastSuccess(`Switched to ${meta?.name || 'unknown network'}`)
                    handleOpenChange(false)
                },
                onError: () => {
                    toastError('Failed to switch network')
                },
                onSettled: () => {
                    setPendingChainId(null)
                },
            }
        )
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-md bg-card/95 backdrop-blur-md border-border/50 card-glow"
                aria-describedby="network-switch-description"
            >
                <DialogHeader>
                    <DialogTitle className="text-lg">Select Network</DialogTitle>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search chains..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-muted/30 border-border/50"
                        autoFocus
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-4">
                    {mainnets.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground/70 px-1 uppercase tracking-wider">
                                Mainnets
                            </p>
                            {mainnets.map((chain) => (
                                <ChainItem
                                    key={chain.id}
                                    chainId={chain.id}
                                    currentChainId={chainId}
                                    pendingChainId={pendingChainId}
                                    onSelect={handleSwitchChain}
                                />
                            ))}
                        </div>
                    )}

                    {testnets.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground/70 px-1 uppercase tracking-wider">
                                Testnets
                            </p>
                            {testnets.map((chain) => (
                                <ChainItem
                                    key={chain.id}
                                    chainId={chain.id}
                                    currentChainId={chainId}
                                    pendingChainId={pendingChainId}
                                    onSelect={handleSwitchChain}
                                />
                            ))}
                        </div>
                    )}

                    {!hasResults && <EmptyState title="No chains found" className="py-8" />}
                </div>
            </DialogContent>
        </Dialog>
    )
}

interface ChainItemProps {
    chainId: number
    currentChainId: number
    pendingChainId: number | null
    onSelect: (chainId: number) => void
}

function ChainItem({ chainId, currentChainId, pendingChainId, onSelect }: ChainItemProps) {
    const meta = getChainMetadata(chainId)
    if (!meta) return null

    const isActive = chainId === currentChainId
    const isPending = pendingChainId === chainId

    return (
        <button
            onClick={() => onSelect(chainId)}
            disabled={isActive || isPending}
            className={`flex items-center gap-3 w-full p-2 rounded-xl transition-all duration-150 ${
                isActive
                    ? 'bg-muted/40 border border-border'
                    : 'border border-transparent hover:bg-muted/50'
            } disabled:cursor-not-allowed`}
            aria-label={`Switch to ${meta.name}`}
        >
            <div
                className={`relative h-8 w-8 flex-shrink-0 rounded-full ${isActive ? 'ring-2 ring-border' : ''}`}
            >
                <Image
                    src={meta.icon}
                    alt={meta.name}
                    fill
                    className={cn(
                        'rounded-full object-cover',
                        'invertInLight' in meta && meta.invertInLight && 'invert dark:invert-0'
                    )}
                />
            </div>
            <div className="flex-1 text-left">
                <div
                    className={`text-sm ${isActive ? 'font-semibold text-foreground' : 'font-medium'}`}
                >
                    {meta.name}
                </div>
            </div>
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-foreground" />}
            {isActive && !isPending && (
                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-foreground/10">
                    <Check className="h-3 w-3 text-foreground" />
                </div>
            )}
        </button>
    )
}

export function NetworkSwitcher({ className = '' }: { className?: string }) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const chainId = useChainId()
    const { isPending } = useSwitchChain()
    const currentChain = getChainMetadata(chainId)

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                aria-label="Select network"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${className}`}
            >
                {currentChain && (
                    <>
                        <div className="relative h-5 w-5">
                            <Image
                                src={currentChain.icon}
                                alt={currentChain.name}
                                fill
                                className={cn(
                                    'rounded-full object-cover',
                                    'invertInLight' in currentChain &&
                                        currentChain.invertInLight &&
                                        'invert dark:invert-0'
                                )}
                            />
                        </div>
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </>
                )}
            </button>
            <NetworkSwitcherModal open={isModalOpen} onOpenChange={setIsModalOpen} />
        </>
    )
}
