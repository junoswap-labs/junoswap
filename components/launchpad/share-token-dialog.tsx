'use client'

import { useRef, useState } from 'react'
import type { Address } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TokenIcon } from '@/components/ui/token-icon'
import { useShareableImage } from '@/hooks/useShareableImage'
import { formatCompact } from '@/services/launchpad'
import { cn } from '@/lib/utils'
import { toastSuccess } from '@/lib/toast'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
import { Check, Copy, Download, ImageIcon, ArrowRight } from 'lucide-react'

interface ShareTokenDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tokenAddr: Address
    symbol: string
    name: string
    logo?: string
    marketCap: string
    priceChange1dPct?: number | null
    isGraduated?: boolean
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    )
}

function LogoMark({ size = 24 }: { size?: number }) {
    return (
        <div
            className="bg-gradient-to-br from-primary to-[#FF914D]"
            style={{
                width: size,
                height: size,
                WebkitMaskImage: 'url(/logo.svg)',
                maskImage: 'url(/logo.svg)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
            }}
        />
    )
}

export function ShareTokenDialog({
    open,
    onOpenChange,
    tokenAddr,
    symbol,
    name,
    logo,
    marketCap,
    priceChange1dPct,
    isGraduated,
}: ShareTokenDialogProps) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [copied, setCopied] = useState(false)
    const { downloadImage, copyToClipboard, isGenerating } = useShareableImage()
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://junoswap.trade'}/launchpad/token/${tokenAddr}`

    const mcapNum = parseFloat(marketCap)
    const mcapDisplay =
        mcapNum > 0
            ? nativeUsdPrice !== null
                ? `$${formatCompact(mcapNum * nativeUsdPrice)}`
                : `${formatCompact(mcapNum)} KUB`
            : null

    const copyLink = () => {
        navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        toastSuccess('Link copied to clipboard!')
        setTimeout(() => setCopied(false), 2000)
    }

    const shareOnX = () => {
        const text = `$${symbol} on Junoswap Launchpad 🚀`
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
        window.open(intentUrl, '_blank', 'noopener,noreferrer')
    }

    const handleCapture = (action: (el: HTMLElement) => Promise<void>) => {
        if (!cardRef.current) return
        action(cardRef.current)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md gap-5 rounded-2xl p-6">
                <DialogHeader>
                    <DialogTitle className="text-xl">Share coin</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Copy link or share directly to X
                    </p>
                </DialogHeader>

                {/* Premium token card — captured as image */}
                <div ref={cardRef} className="overflow-hidden rounded-xl bg-[#0a0e14]">
                    <div
                        className="relative overflow-hidden rounded-xl border border-white/10"
                        style={{
                            backgroundImage:
                                'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                        }}
                    >
                        {/* Brand glows */}
                        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-20 -right-12 h-48 w-48 rounded-full bg-[#FF914D]/15 blur-3xl" />

                        <div className="relative flex items-center justify-between gap-4 p-5">
                            {/* Left — platform + token identity */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <LogoMark size={16} />
                                    <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-xs font-bold text-transparent">
                                        Junoswap
                                    </span>
                                </div>

                                <h3 className="mt-3 truncate text-3xl font-extrabold uppercase tracking-tight text-white">
                                    {symbol}
                                </h3>
                                <p className="mt-0.5 truncate text-sm text-white/55">{name}</p>

                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                    {mcapDisplay && (
                                        <span className="text-sm font-semibold text-white">
                                            MC {mcapDisplay}
                                        </span>
                                    )}
                                    {priceChange1dPct != null && (
                                        <span
                                            className={cn(
                                                'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                                                priceChange1dPct >= 0
                                                    ? 'bg-emerald-500/15 text-emerald-400'
                                                    : 'bg-red-500/15 text-red-400'
                                            )}
                                        >
                                            {priceChange1dPct >= 0 ? '+' : ''}
                                            {priceChange1dPct.toFixed(2)}%
                                        </span>
                                    )}
                                    {isGraduated && (
                                        <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                                            Graduated
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#FF914D] px-4 py-1.5 text-xs font-bold tracking-wider text-white">
                                    BUY
                                    <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>

                            {/* Right — token image */}
                            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                                <TokenIcon
                                    src={logo}
                                    symbol={symbol}
                                    size="xl"
                                    variant="square"
                                    className="h-28 w-28 rounded-xl"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                    <button
                        onClick={copyLink}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#FF914D] text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied!' : 'Copy link'}
                    </button>
                    <button
                        onClick={shareOnX}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
                    >
                        <XIcon className="h-4 w-4" />
                        Share on X
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={() =>
                                handleCapture((el) =>
                                    downloadImage(el, `junoswap-${symbol.toLowerCase()}.png`)
                                )
                            }
                            disabled={isGenerating}
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Download image
                        </button>
                        <button
                            onClick={() => handleCapture(copyToClipboard)}
                            disabled={isGenerating}
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                        >
                            <ImageIcon className="h-3.5 w-3.5" />
                            Copy image
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
