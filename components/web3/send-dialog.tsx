'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import type { Address } from 'viem'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TokenSelect } from '@/components/swap/token-select'
import { useChainTokens } from '@/hooks/useChainTokens'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useSendToken } from '@/hooks/useSendToken'
import { isValidNumberInput } from '@/lib/utils'
import {
    isValidTokenAddress,
    formatBalance,
    formatTokenAmount,
    parseTokenAmount,
} from '@/services/tokens'
import { getExplorerTxUrl } from '@/lib/explorer'
import { toastError } from '@/lib/toast'
import { Check } from 'lucide-react'
import type { Token } from '@/types/tokens'

interface SendDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SendDialog({ open, onOpenChange }: SendDialogProps) {
    const { address } = useAccount()
    const chainId = useChainId()
    const { tokens } = useChainTokens(chainId)

    const [selectedToken, setSelectedToken] = useState<Token | null>(null)
    const [recipientInput, setRecipientInput] = useState('')
    const [amount, setAmount] = useState('')

    // Default to the chain's native token; keep selection if it survives a token-list refresh / chain switch.
    useEffect(() => {
        if (tokens.length === 0) return
        const stillPresent =
            selectedToken &&
            tokens.some(
                (t) => t.address === selectedToken.address && t.chainId === selectedToken.chainId
            )
        if (!stillPresent) setSelectedToken(tokens[0] ?? null)
    }, [tokens, selectedToken])

    const { balance, refetch } = useTokenBalance({
        token: selectedToken,
        address: address as Address | undefined,
    })

    const trimmedRecipient = recipientInput.trim()
    const isValidRecipient = isValidTokenAddress(trimmedRecipient)
    const recipient: Address | null = isValidRecipient ? (trimmedRecipient as Address) : null

    const { send, isExecuting, isConfirming, isSuccess, isError, error, hash, reset } =
        useSendToken({ token: selectedToken, recipient, amount })

    const rawAmount =
        selectedToken && amount ? parseTokenAmount(amount, selectedToken.decimals) : 0n
    const hasInsufficientBalance = !!selectedToken && rawAmount > 0n && rawAmount > balance
    const isBusy = isExecuting || isConfirming
    const canSend =
        !!selectedToken && isValidRecipient && rawAmount > 0n && !hasInsufficientBalance && !isBusy

    const handleMax = () => {
        if (selectedToken && balance > 0n) {
            setAmount(formatTokenAmount(balance, selectedToken.decimals))
        }
    }

    // Success: toast with explorer link, refresh balance, reset + close.
    useEffect(() => {
        if (isSuccess && hash) {
            const explorerUrl = getExplorerTxUrl(chainId, hash)
            toast.success('Send successful!', {
                action: {
                    label: 'View Transaction',
                    onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
                },
            })
            refetch()
            reset()
            setAmount('')
            setRecipientInput('')
            onOpenChange(false)
        }
    }, [isSuccess, hash, chainId, refetch, reset, onOpenChange])

    useEffect(() => {
        if (isError && error) {
            toastError(error, 'Send failed')
        }
    }, [isError, error])

    // Clear local + transaction state when the dialog closes.
    useEffect(() => {
        if (!open) {
            reset()
            setAmount('')
            setRecipientInput('')
        }
    }, [open, reset])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md bg-card/95 backdrop-blur-md border-border/50"
                aria-describedby="send-description"
            >
                <DialogHeader>
                    <DialogTitle className="text-lg">Send</DialogTitle>
                </DialogHeader>
                <p id="send-description" className="sr-only">
                    Transfer tokens to another wallet address
                </p>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Recipient</span>
                            {isValidRecipient ? (
                                <span className="flex items-center gap-1 text-xs text-positive">
                                    <Check className="h-3 w-3" aria-hidden="true" /> Valid address
                                </span>
                            ) : recipientInput ? (
                                <span className="text-xs text-muted-foreground/70">
                                    Invalid address
                                </span>
                            ) : null}
                        </div>
                        <Input
                            placeholder="0x... recipient address"
                            value={recipientInput}
                            onChange={(e) => setRecipientInput(e.target.value)}
                            spellCheck={false}
                            autoComplete="off"
                            className="font-mono text-sm"
                        />
                    </div>

                    <div className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span
                                className={`text-xs ${
                                    balance > 0n
                                        ? 'text-muted-foreground cursor-pointer hover:underline'
                                        : 'text-muted-foreground'
                                }`}
                                onClick={handleMax}
                            >
                                Balance: {formatBalance(balance, selectedToken?.decimals ?? 18)}
                            </span>
                            <TokenSelect
                                token={selectedToken}
                                tokens={tokens}
                                onSelect={setSelectedToken}
                            />
                        </div>
                        <Input
                            type="text"
                            placeholder="0"
                            autoComplete="off"
                            inputMode="decimal"
                            pattern="^[0-9]*\.?[0-9]*$"
                            value={amount}
                            onChange={(e) => {
                                if (isValidNumberInput(e.target.value)) setAmount(e.target.value)
                            }}
                            className="flex-1 h-10 text-2xl font-medium md:text-2xl p-0"
                        />
                    </div>

                    {hasInsufficientBalance && (
                        <p className="text-xs text-destructive">Insufficient balance</p>
                    )}

                    <Button
                        className="w-full"
                        size="lg"
                        onClick={send}
                        disabled={!canSend}
                        isLoading={isBusy}
                        loadingText={isConfirming ? 'Confirming…' : 'Sending…'}
                    >
                        Send
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
