'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toastSuccess } from '@/lib/toast'

function XIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    )
}

interface ReferralDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// Builds the swap URL with the connected wallet as `?ref=` — the exact param
// useReferrer() reads back to attribute a swap to this referrer.
export function ReferralDialog({ open, onOpenChange }: ReferralDialogProps) {
    const { address } = useAccount()
    const [copied, setCopied] = useState(false)

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://junoswap.trade'
    const referralLink = address ? `${origin}/swap?ref=${address}` : ''

    const copyLink = () => {
        if (!referralLink) return
        navigator.clipboard.writeText(referralLink)
        setCopied(true)
        toastSuccess('Referral link copied!')
        setTimeout(() => setCopied(false), 2000)
    }

    const shareOnX = () => {
        if (!referralLink) return
        const text = 'Swap on Junoswap with my referral link 👇'
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralLink)}`
        window.open(intentUrl, '_blank', 'noopener,noreferrer')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-card/95 backdrop-blur-md border-border/50">
                <DialogHeader>
                    <DialogTitle>Share your referral link</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                    Swaps made through your link are attributed to your wallet.
                </p>
                <div className="break-all rounded-lg bg-muted p-3 font-mono text-sm">
                    {referralLink}
                </div>
                <div className="space-y-2">
                    <Button onClick={copyLink} className="w-full" size="lg">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied!' : 'Copy link'}
                    </Button>
                    <Button variant="secondary" onClick={shareOnX} className="w-full" size="lg">
                        <XIcon className="h-4 w-4" />
                        Share on X
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
