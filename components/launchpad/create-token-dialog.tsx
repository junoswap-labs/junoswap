'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { Address } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateToken } from '@/hooks/useCreateToken'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { toastError, toastSuccess, toastWarning } from '@/lib/toast'
import { uploadToPinata } from '@/app/actions/upload-to-pinata'
import { getChainMetadata } from '@/lib/wagmi'
import { formatKub, formatTokenAmount } from '@/services/launchpad'
import type { CreateTokenForm, LaunchToken } from '@/types/launchpad'
import { Globe, Twitter, MessageCircle, Coins } from 'lucide-react'
import { LogoUpload } from './logo-upload'

interface CreateTokenDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CreateTokenDialog({ open, onOpenChange }: CreateTokenDialogProps) {
    const { isConnected, address } = useAccount()
    const queryClient = useQueryClient()
    const router = useRouter()

    const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
    const [uploadingLogo, setUploadingLogo] = useState(false)

    const [form, setForm] = useState<CreateTokenForm>({
        name: '',
        symbol: '',
        logo: '',
        description: '',
        link1: '',
        link2: '',
        link3: '',
        upfrontBuyAmount: '',
    })

    const {
        create,
        phase,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error,
        hash,
        createdTokenAddress,
        expectedTokens,
        totalCost,
    } = useCreateToken({
        form: form.name && form.symbol ? form : null,
    })

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setForm({
                name: '',
                symbol: '',
                logo: '',
                description: '',
                link1: '',
                link2: '',
                link3: '',
                upfrontBuyAmount: '',
            })
            setPendingLogoFile(null)
        }
    }, [open])

    // Handle success
    const handleSuccess = useCallback(async () => {
        const metadata = getChainMetadata(PUMP_CORE_NATIVE_CHAIN_ID)
        toastSuccess('Token created!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${metadata.explorer}/tx/${hash}`, '_blank'),
            },
        })
        onOpenChange(false)
    }, [hash, onOpenChange])

    useEffect(() => {
        if (isSuccess) handleSuccess()
    }, [isSuccess, handleSuccess])

    // Redirect to the new token's detail page after creation settles
    useEffect(() => {
        if (!createdTokenAddress || !isSuccess) return
        router.push(`/launchpad/token/${createdTokenAddress}`)
    }, [createdTokenAddress, isSuccess, router])

    // Handle error — partial success (token created but buy failed)
    useEffect(() => {
        if (isError && error && phase === 'error') {
            toastWarning(
                'Token created, but upfront buy failed. You can buy manually on the token page.'
            )
            onOpenChange(false)
        }
    }, [isError, error, phase, onOpenChange])

    // Handle create-phase error
    useEffect(() => {
        if (isError && error && phase === 'error' && !hash) {
            toastError(error, 'Token creation failed')
        }
    }, [isError, error, phase, hash])

    // Optimistically show the new token in the home list, then reconcile
    // with indexed data once Ponder catches up.
    type TokenListCache = { tokens: LaunchToken[]; snapshotMap: Map<string, unknown> }
    const didPrependRef = useRef(false)

    useEffect(() => {
        // Address cleared by useCreateToken.create() on a new cycle → re-arm.
        if (!createdTokenAddress) {
            didPrependRef.current = false
            return
        }
        if (didPrependRef.current) return
        didPrependRef.current = true

        queryClient.setQueryData<TokenListCache>(['launchpad-token-list'], (old) => {
            if (!old) return old
            const lower = createdTokenAddress.toLowerCase()
            if (old.tokens.some((t) => t.address.toLowerCase() === lower)) return old
            const optimistic: LaunchToken = {
                address: createdTokenAddress,
                name: form.name,
                symbol: form.symbol,
                logo: form.logo,
                description: form.description,
                link1: form.link1,
                link2: form.link2,
                link3: form.link3,
                creator: (address ?? '0x0') as Address,
                createdTime: Math.floor(Date.now() / 1000),
                chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                graduatedAt: null,
                isGraduated: false,
            }
            return { ...old, tokens: [optimistic, ...old.tokens] }
        })

        // Reconcile with indexed data now, and again once Ponder has caught up.
        queryClient.invalidateQueries({ queryKey: ['launchpad-token-list'] })
        const timeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['launchpad-token-list'] })
        }, 4000)
        return () => clearTimeout(timeout)
    }, [createdTokenAddress, form, address, queryClient])

    const updateField = (field: keyof CreateTokenForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    const handleCreate = async () => {
        let logoUrl = form.logo

        if (pendingLogoFile) {
            setUploadingLogo(true)
            const fd = new FormData()
            fd.append('file', pendingLogoFile)
            const result = await uploadToPinata(fd)
            setUploadingLogo(false)

            if (!result.success) {
                toastError(new Error(result.error), 'Logo upload failed')
                return
            }

            logoUrl = result.url
            setForm((prev) => ({ ...prev, logo: result.url }))
            setPendingLogoFile(null)
        }

        create(logoUrl)
    }

    const getButtonText = () => {
        if (!isConnected) return 'Connect Wallet'
        if (!form.name.trim() || !form.symbol.trim()) return 'Enter Name & Symbol'
        if (uploadingLogo) return 'Uploading logo...'
        if (phase === 'creating') return 'Creating token...'
        if (phase === 'buying') return 'Buying tokens...'
        return 'Create Token'
    }

    const isButtonDisabled =
        !isConnected ||
        !form.name.trim() ||
        !form.symbol.trim() ||
        uploadingLogo ||
        isExecuting ||
        isConfirming

    const hasUpfrontBuy = form.upfrontBuyAmount && parseFloat(form.upfrontBuyAmount) > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">Create Token</DialogTitle>
                </DialogHeader>

                <div className="space-y-3.5 overflow-y-auto max-h-[calc(90vh-6rem)] pr-1 sm:max-h-none sm:pr-0">
                    {/* Logo + Name/Symbol row */}
                    <div className="flex gap-3">
                        <LogoUpload onFileSelect={setPendingLogoFile} compact />
                        <div className="flex-1 space-y-2">
                            <Input
                                placeholder="Token Name *"
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                            />
                            <Input
                                placeholder="SYMBOL *"
                                value={form.symbol}
                                onChange={(e) =>
                                    updateField('symbol', e.target.value.toUpperCase())
                                }
                                maxLength={10}
                                className="uppercase"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <Textarea
                        placeholder="Description (optional)"
                        value={form.description}
                        onChange={(e) => updateField('description', e.target.value)}
                    />

                    {/* Social links */}
                    <div className="space-y-1.5">
                        <div className="relative">
                            <Globe className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Website"
                                value={form.link1}
                                onChange={(e) => updateField('link1', e.target.value)}
                                className="pl-9 h-8 text-sm"
                            />
                        </div>
                        <div className="relative">
                            <Twitter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Twitter / X"
                                value={form.link2}
                                onChange={(e) => updateField('link2', e.target.value)}
                                className="pl-9 h-8 text-sm"
                            />
                        </div>
                        <div className="relative">
                            <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Telegram"
                                value={form.link3}
                                onChange={(e) => updateField('link3', e.target.value)}
                                className="pl-9 h-8 text-sm"
                            />
                        </div>
                    </div>

                    {/* Upfront buy */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Coins className="h-3.5 w-3.5" />
                            Buy Upfront (Optional)
                        </div>
                        <div className="relative">
                            <Input
                                type="number"
                                placeholder="0.0"
                                min="0"
                                step="0.01"
                                value={form.upfrontBuyAmount}
                                onChange={(e) => updateField('upfrontBuyAmount', e.target.value)}
                                className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                                KUB
                            </span>
                        </div>
                        {expectedTokens > 0n && (
                            <p className="text-xs text-muted-foreground">
                                ~{formatTokenAmount(expectedTokens)} tokens
                            </p>
                        )}
                    </div>

                    {/* Summary */}
                    <div className="flex items-center justify-between text-sm px-1">
                        <span className="text-muted-foreground">
                            Total{hasUpfrontBuy ? ' (fee + buy)' : ''}
                        </span>
                        <span className="font-semibold">{formatKub(totalCost)} KUB</span>
                    </div>

                    <Button
                        className="w-full"
                        size="lg"
                        onClick={handleCreate}
                        disabled={isButtonDisabled}
                        isLoading={isExecuting || isConfirming}
                        loadingText={getButtonText()}
                    >
                        {getButtonText()}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
