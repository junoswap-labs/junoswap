'use client'

import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react'
import {
    useChainId,
    useAccount,
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from 'wagmi'
import { formatUnits, maxUint256, parseUnits } from 'viem'
import type { Address } from 'viem'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TokenSelect } from '@/components/swap/token-select'

import { getBatchTransferAddress, FEE_TYPE } from '@/lib/batch-config'
import {
    parseRecipientText,
    parseAddressText,
    randomizeAmounts,
    type ParsedRecipient,
} from '@/lib/multi-send-parse'
import { getChainMetadata, isNativeToken } from '@/lib/wagmi'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { parseSpreadsheetFile } from '@/lib/spreadsheet-parser'
import { toastError, toastSuccess } from '@/lib/toast'
import { getExplorerTxUrl } from '@/lib/explorer'

import { useBatchFeeConfig, calcFee, isFeeNative } from '@/hooks/useBatchFeeConfig'
import { useMultiSendTransfer } from '@/hooks/useMultiSendTransfer'
import { useChainTokens } from '@/hooks/useChainTokens'
import type { Token } from '@/types/tokens'

import {
    Upload,
    AlertCircle,
    Loader2,
    Shuffle,
    Copy,
    Check,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TokenMode = 'native' | 'erc20'
type InputMode = 'manual' | 'random'

const MANUAL_PLACEHOLDER = `0xAbc...123,1.5\n0xDef...456,2.0\n0x789...000,0.5`
const RANDOM_PLACEHOLDER = `0xAbc...123\n0xDef...456\n0x789...000`

// ── Copy address button ───────────────────────────────────────────────────────

function CopyAddress({ address, label }: { address: string; label?: string }) {
    const [copied, setCopied] = useState(false)

    function handleCopy() {
        navigator.clipboard.writeText(address).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const short = `${address.slice(0, 6)}…${address.slice(-4)}`

    return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            {label && <span>{label}:</span>}
            <span className="font-mono">{short}</span>
            <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground transition-colors"
                title={address}
            >
                {copied ? (
                    <Check className="h-3 w-3 text-positive" />
                ) : (
                    <Copy className="h-3 w-3" />
                )}
                {copied && <span className="text-positive">Copied!</span>}
            </button>
        </div>
    )
}

// ── Line-numbered textarea ────────────────────────────────────────────────────

function LineNumberedTextarea({
    value,
    onChange,
    placeholder,
    errorLines = [],
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    errorLines?: number[]
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const gutterRef = useRef<HTMLDivElement>(null)

    const lineCount = Math.max(value ? value.split('\n').length : 1, 1)
    const deferredErrorLines = useDeferredValue(errorLines)
    const errorSet = useMemo(() => new Set(deferredErrorLines), [deferredErrorLines])

    function handleScroll() {
        if (gutterRef.current && textareaRef.current)
            gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }

    return (
        <div
            className="relative flex rounded-md border bg-background font-mono text-sm focus-within:ring-1 focus-within:ring-ring"
            style={{ maxHeight: '480px' }}
        >
            {/* Gutter */}
            <div
                ref={gutterRef}
                className="pointer-events-none select-none overflow-hidden border-r bg-muted/40 px-2 py-2 text-right text-xs text-muted-foreground/60 shrink-0"
                style={{ minWidth: '2.5rem' }}
                aria-hidden
            >
                {Array.from({ length: lineCount }, (_, i) => (
                    <div
                        key={i}
                        className={cn(
                            'leading-[1.5rem]',
                            errorSet.has(i + 1) && 'font-semibold text-destructive'
                        )}
                    >
                        {i + 1}
                    </div>
                ))}
            </div>
            {/* Editor */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                rows={Math.max(lineCount, 6)}
                className="w-full resize-none overflow-y-auto bg-transparent py-2 pl-2 pr-3 text-sm leading-[1.5rem] text-foreground outline-none placeholder:text-muted-foreground/40"
            />
        </div>
    )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function MultiSendCard() {
    const chainId = useChainId()
    const { address: userAddress } = useAccount()
    const chainMeta = getChainMetadata(chainId)
    const contractAddress = getBatchTransferAddress(chainId)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [tokenMode, setTokenMode] = useState<TokenMode>('native')
    const [inputMode, setInputMode] = useState<InputMode>('manual')
    const [recipientText, setRecipientText] = useState('')
    const [reviewPage, setReviewPage] = useState(0)
    const [selectedToken, setSelectedToken] = useState<Token | null>(null)
    const [isFileLoading, setIsFileLoading] = useState(false)

    // Random mode state
    const [minAmount, setMinAmount] = useState('')
    const [maxAmount, setMaxAmount] = useState('')
    const [displayDecimals, setDisplayDecimals] = useState('6')
    const [randomRecipients, setRandomRecipients] = useState<ParsedRecipient[]>([])

    const { feeConfig } = useBatchFeeConfig(chainId)

    const { tokens: allTokens } = useChainTokens(chainId)
    const erc20Tokens = useMemo(
        () => allTokens.filter((t) => !isNativeToken(t.address)),
        [allTokens]
    )

    const nativeSymbol = chainMeta?.symbol ?? 'ETH'
    const decimals = tokenMode === 'native' ? 18 : (selectedToken?.decimals ?? 18)
    const symbol = tokenMode === 'native' ? nativeSymbol : (selectedToken?.symbol ?? '?')
    const erc20Address = selectedToken?.address as Address | undefined

    // Defer expensive parse so typing feels instant
    const deferredText = useDeferredValue(recipientText)

    // Parse recipients depending on mode
    const { recipients: manualRecipients, errors: manualErrors } = useMemo(
        () =>
            inputMode === 'manual'
                ? parseRecipientText(deferredText, decimals)
                : { recipients: [], errors: [] },
        [deferredText, decimals, inputMode]
    )

    const { addresses: randomAddresses, errors: randomErrors } = useMemo(
        () =>
            inputMode === 'random' ? parseAddressText(deferredText) : { addresses: [], errors: [] },
        [deferredText, inputMode]
    )

    const recipients = inputMode === 'manual' ? manualRecipients : randomRecipients
    const errors = inputMode === 'manual' ? manualErrors : randomErrors

    // Reset randomized results when addresses or range change
    useEffect(() => {
        setRandomRecipients([])
        setReviewPage(0)
    }, [recipientText, minAmount, maxAmount, displayDecimals, inputMode])

    // Reset when switching mode
    useEffect(() => {
        setRecipientText('')
        setRandomRecipients([])
        setReviewPage(0)
    }, [inputMode])

    const totalSend = useMemo(() => recipients.reduce((sum, r) => sum + r.amount, 0n), [recipients])

    // Fee token symbol (fetch from chain when fee is not native)
    const feeIsNative = isFeeNative(feeConfig)
    const { data: feeTokenSymbol } = useReadContract({
        address: feeConfig?.feeToken,
        abi: ERC20_ABI,
        functionName: 'symbol',
        chainId,
        query: { enabled: !!feeConfig && !feeIsNative },
    })
    const feeSymbol = feeIsNative ? nativeSymbol : ((feeTokenSymbol as string | undefined) ?? '…')

    // Randomize
    const randomRangeError = useMemo(() => {
        if (!minAmount || !maxAmount) return null
        const min = Number(minAmount)
        const max = Number(maxAmount)
        if (isNaN(min) || min <= 0) return 'Min must be > 0'
        if (isNaN(max) || max <= 0) return 'Max must be > 0'
        if (min >= max) return 'Min must be less than Max'

        // Check effective range after truncation
        const dp = Math.min(Math.max(0, parseInt(displayDecimals) || 0), decimals)
        if (dp < decimals) {
            try {
                const truncFactor = 10n ** BigInt(decimals - dp)
                const minBig =
                    ((parseUnits(minAmount, decimals) + truncFactor - 1n) / truncFactor) *
                    truncFactor
                const maxBig = (parseUnits(maxAmount, decimals) / truncFactor) * truncFactor
                if (minBig > maxBig) {
                    return `Range collapses at ${dp} decimal places — increase Decimal Places or widen the range`
                }
            } catch {
                // ignore parse errors, will surface on randomize
            }
        }

        return null
    }, [minAmount, maxAmount, displayDecimals, decimals])

    function handleRandomize() {
        if (randomRangeError || randomAddresses.length === 0) return
        const dp = Math.min(Math.max(0, parseInt(displayDecimals) || 0), decimals)
        try {
            const result = randomizeAmounts(randomAddresses, minAmount, maxAmount, decimals, dp)
            setRandomRecipients(result)
        } catch (e) {
            toastError(e instanceof Error ? e : 'Failed to randomize', 'Error')
        }
    }

    // ERC-20 allowance
    const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({
        address: erc20Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [userAddress ?? '0x0', contractAddress ?? '0x0'],
        chainId,
        query: {
            enabled: tokenMode === 'erc20' && !!erc20Address && !!userAddress && !!contractAddress,
        },
    })
    const needsApproval = tokenMode === 'erc20' && !!erc20Address && allowance < totalSend

    // Approve
    const {
        data: approveHash,
        writeContract: writeApprove,
        isPending: isApprovePending,
        isError: isApproveError,
        error: approveError,
    } = useWriteContract()
    const { isSuccess: approveSuccess, isPending: approveReceiptPending } =
        useWaitForTransactionReceipt({ hash: approveHash, chainId })
    const approveConfirming = !!approveHash && approveReceiptPending

    const [isRefetchingAllowance, setIsRefetchingAllowance] = useState(false)
    useEffect(() => {
        if (!approveSuccess) return
        setIsRefetchingAllowance(true)
        toastSuccess(`${symbol} approved`)
        refetchAllowance().finally(() => setIsRefetchingAllowance(false))
    }, [approveSuccess, refetchAllowance, symbol])

    useEffect(() => {
        if (isApproveError && approveError) toastError(approveError, 'Approval failed')
    }, [isApproveError, approveError])

    function handleApprove() {
        if (!contractAddress || !erc20Address) return
        writeApprove({
            address: erc20Address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, maxUint256],
            chainId,
        })
    }

    // Send
    const {
        sendNative,
        sendERC20,
        hash: sendHash,
        isWritePending,
        isConfirming,
        isSuccess,
        isError: isSendError,
        error: sendError,
        reset,
    } = useMultiSendTransfer(chainId)

    useEffect(() => {
        if (!isSuccess || !sendHash) return
        const explorerUrl = getExplorerTxUrl(chainId, sendHash)
        toastSuccess('Multi-Send successful!', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
            },
        })
        setRecipientText('')
        setRandomRecipients([])
        reset()
    }, [isSuccess, sendHash, chainId, reset])

    useEffect(() => {
        if (isSendError && sendError) toastError(sendError, 'Send failed')
    }, [isSendError, sendError])

    function handleSend() {
        if (recipients.length === 0) return
        if (tokenMode === 'native') sendNative(recipients, feeConfig)
        else if (erc20Address) sendERC20(erc20Address, recipients, feeConfig)
    }

    function handleAction() {
        if (needsApproval) handleApprove()
        else handleSend()
    }

    // File upload — in random mode only read addresses
    async function handleFile(file: File) {
        setIsFileLoading(true)
        try {
            const rows = await parseSpreadsheetFile(file)
            if (rows.length === 0) {
                toastError('No valid rows found. Check the file format.', 'Upload failed')
                return
            }
            if (inputMode === 'random') {
                setRecipientText(rows.map((r) => r.address).join('\n'))
            } else {
                setRecipientText(rows.map((r) => `${r.address},${r.amount}`).join('\n'))
            }
        } catch (e) {
            toastError(e instanceof Error ? e : 'Failed to parse file', 'Upload failed')
        } finally {
            setIsFileLoading(false)
        }
    }

    // Derived state
    const isContractReady = !!contractAddress
    const isErc20Ready = tokenMode === 'erc20' ? !!erc20Address : true
    const hasRandomizedResult = inputMode === 'random' && randomRecipients.length > 0
    const isReady =
        recipients.length > 0 &&
        errors.length === 0 &&
        isContractReady &&
        isErc20Ready &&
        (inputMode === 'manual' || hasRandomizedResult)
    const isBusy =
        isWritePending ||
        isConfirming ||
        isApprovePending ||
        approveConfirming ||
        isRefetchingAllowance

    const fee = calcFee(feeConfig, recipients.length)
    const hasFee = feeConfig && feeConfig.feeType !== FEE_TYPE.NONE

    function getButtonLabel() {
        if (!isContractReady) return 'Contract not deployed on this chain'
        if (tokenMode === 'erc20' && !erc20Address) return 'Select a token'
        if (recipientText.trim() === '') return 'Enter recipients'
        if (errors.length > 0) return `Fix ${errors.length} error${errors.length > 1 ? 's' : ''}`
        if (inputMode === 'random' && !hasRandomizedResult) return 'Randomize amounts first'
        if (needsApproval) return `Approve ${symbol}`
        return `Send to ${recipients.length} address${recipients.length > 1 ? 'es' : ''}`
    }

    const isApproving = isApprovePending || approveConfirming || isRefetchingAllowance
    const isSending = isWritePending || isConfirming
    const approveLoadingText = approveConfirming ? 'Approving…' : 'Confirm in wallet…'
    const sendLoadingText = isConfirming ? 'Sending…' : 'Confirm in wallet…'

    const canRandomize =
        randomAddresses.length > 0 &&
        randomErrors.length === 0 &&
        !!minAmount &&
        !!maxAmount &&
        !randomRangeError

    return (
        <div className="space-y-3">
            <div>
                <h1 className="text-xl font-semibold">Multi-Send</h1>
                <p className="text-sm text-muted-foreground">
                    Send tokens to multiple addresses in one transaction
                </p>
            </div>

            {/* Step 1 — Token */}
            <Section label="1  Token">
                <div className="flex rounded-lg border p-1 gap-1">
                    <button
                        onClick={() => setTokenMode('native')}
                        className={cn(
                            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tokenMode === 'native'
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Native · {nativeSymbol}
                    </button>
                    <button
                        onClick={() => setTokenMode('erc20')}
                        className={cn(
                            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tokenMode === 'erc20'
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        ERC-20 Token
                    </button>
                </div>

                {tokenMode === 'erc20' && (
                    <div className="mt-3">
                        <TokenSelect
                            token={selectedToken}
                            tokens={erc20Tokens}
                            onSelect={setSelectedToken}
                            className="w-full justify-start"
                        />
                    </div>
                )}
            </Section>

            {/* Step 2 — Recipients */}
            <Section
                label="2  Recipients"
                action={
                    <div className="flex items-center gap-3">
                        {/* Mode toggle */}
                        <div className="flex items-center rounded-md border p-0.5 gap-0.5 text-xs">
                            <button
                                onClick={() => setInputMode('manual')}
                                className={cn(
                                    'rounded px-2 py-0.5 font-medium transition-colors',
                                    inputMode === 'manual'
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Manual
                            </button>
                            <button
                                onClick={() => setInputMode('random')}
                                className={cn(
                                    'flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors',
                                    inputMode === 'random'
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Shuffle className="h-3 w-3" />
                                Random
                            </button>
                        </div>

                        {/* Upload */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            {isFileLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Upload className="h-3.5 w-3.5" />
                            )}
                            Upload CSV / Excel
                        </button>
                    </div>
                }
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleFile(f)
                        e.target.value = ''
                    }}
                />

                {/* Random mode — Min/Max range */}
                {inputMode === 'random' && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">
                                    Min ({symbol})
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.1"
                                    value={minAmount}
                                    onChange={(e) => setMinAmount(e.target.value)}
                                    className={cn(
                                        'h-9 text-sm',
                                        randomRangeError && minAmount && 'border-destructive'
                                    )}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">
                                    Max ({symbol})
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="1.0"
                                    value={maxAmount}
                                    onChange={(e) => setMaxAmount(e.target.value)}
                                    className={cn(
                                        'h-9 text-sm',
                                        randomRangeError && maxAmount && 'border-destructive'
                                    )}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Decimals</label>
                                <Input
                                    type="number"
                                    min="0"
                                    max={decimals}
                                    step="1"
                                    placeholder="6"
                                    value={displayDecimals}
                                    onChange={(e) => setDisplayDecimals(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                        </div>
                        {randomRangeError && (
                            <p className="text-xs text-destructive">{randomRangeError}</p>
                        )}
                    </div>
                )}

                <LineNumberedTextarea
                    value={recipientText}
                    onChange={setRecipientText}
                    placeholder={inputMode === 'manual' ? MANUAL_PLACEHOLDER : RANDOM_PLACEHOLDER}
                    errorLines={errors.map((e) => e.line)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                    {inputMode === 'manual' ? (
                        <>
                            One per line · format:{' '}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                                address,amount
                            </code>
                        </>
                    ) : (
                        'One address per line · amounts will be randomized'
                    )}
                </p>

                <div className="flex items-center justify-between">
                    <button
                        onClick={() => {
                            const csv =
                                'address,amount\n0xRecipientAddress1,1.5\n0xRecipientAddress2,2.0\n'
                            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                            Object.assign(document.createElement('a'), {
                                href: url,
                                download: 'multi-send-template.csv',
                            }).click()
                            URL.revokeObjectURL(url)
                        }}
                        className="mt-0.5 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                        Download template
                    </button>

                    {inputMode === 'random' && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRandomize}
                            disabled={!canRandomize}
                            className="gap-1.5 h-8 text-xs"
                        >
                            <Shuffle className="h-3.5 w-3.5" />
                            {hasRandomizedResult ? 'Re-randomize' : 'Randomize'}
                        </Button>
                    )}
                </div>
            </Section>

            {/* Step 3 — Review */}
            {(recipients.length > 0 || errors.length > 0) && (
                <Section label="3  Review">
                    {errors.length > 0 && (
                        <div className="space-y-1 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                                <AlertCircle className="h-3.5 w-3.5" />
                                {errors.length} line{errors.length > 1 ? 's' : ''} with errors
                            </p>
                            {errors.map((err) => (
                                <p key={err.line} className="pl-5 text-xs text-destructive/80">
                                    Line {err.line}: {err.message}
                                </p>
                            ))}
                        </div>
                    )}

                    {recipients.length > 0 &&
                        (() => {
                            const PAGE_SIZE = 20
                            const totalPages = Math.ceil(recipients.length / PAGE_SIZE)
                            const safePage = Math.min(reviewPage, totalPages - 1)
                            const pageRecipients = recipients.slice(
                                safePage * PAGE_SIZE,
                                safePage * PAGE_SIZE + PAGE_SIZE
                            )

                            return (
                                <div className="overflow-hidden rounded-md border">
                                    <div className="flex border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                                        <span className="w-7 shrink-0">#</span>
                                        <span className="flex-1">Address</span>
                                        <span className="w-28 text-right shrink-0">
                                            Amount ({symbol})
                                        </span>
                                    </div>
                                    <div className="divide-y">
                                        {pageRecipients.map((r, i) => {
                                            const globalIdx = safePage * PAGE_SIZE + i
                                            return (
                                                <div
                                                    key={globalIdx}
                                                    className="flex items-center px-3 py-2 transition-colors hover:bg-muted/30"
                                                >
                                                    <span className="w-7 shrink-0 text-xs text-muted-foreground">
                                                        {globalIdx + 1}
                                                    </span>
                                                    <span className="flex-1 truncate font-mono text-xs">
                                                        {r.address.slice(0, 6)}…
                                                        {r.address.slice(-4)}
                                                    </span>
                                                    <span className="w-28 shrink-0 font-mono text-xs tabular-nums text-right">
                                                        {r.rawAmount}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
                                        <Badge variant="secondary" className="text-xs">
                                            {recipients.length} address
                                            {recipients.length > 1 ? 'es' : ''}
                                        </Badge>
                                        {totalPages > 1 && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setReviewPage((p) => Math.max(0, p - 1))
                                                    }
                                                    disabled={safePage === 0}
                                                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                                                >
                                                    <ChevronLeft className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="min-w-[5rem] text-center text-xs text-muted-foreground tabular-nums">
                                                    {safePage * PAGE_SIZE + 1}–
                                                    {Math.min(
                                                        safePage * PAGE_SIZE + PAGE_SIZE,
                                                        recipients.length
                                                    )}{' '}
                                                    of {recipients.length}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setReviewPage((p) =>
                                                            Math.min(totalPages - 1, p + 1)
                                                        )
                                                    }
                                                    disabled={safePage === totalPages - 1}
                                                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                                                >
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                        <span className="text-sm font-semibold tabular-nums">
                                            {formatUnits(totalSend, decimals)} {symbol}
                                        </span>
                                    </div>
                                </div>
                            )
                        })()}
                </Section>
            )}

            {/* Service Fee — always visible */}
            <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Service Fee</span>
                    {hasFee ? (
                        <span className="font-medium tabular-nums">
                            {formatUnits(fee, 18)} {feeSymbol}
                        </span>
                    ) : (
                        <span className="font-medium text-positive">Free</span>
                    )}
                </div>
                {feeConfig && feeConfig.feeType !== FEE_TYPE.NONE && (
                    <p className="text-xs text-muted-foreground/70">
                        {feeConfig.feeType === FEE_TYPE.PER_TX &&
                            `${formatUnits(feeConfig.feeAmount, 18)} ${feeSymbol} per transaction`}
                        {feeConfig.feeType === FEE_TYPE.PER_ADDRESS &&
                            `${formatUnits(feeConfig.feeAmount, 18)} ${feeSymbol} × ${recipients.length} address${recipients.length !== 1 ? 'es' : ''}`}
                        {' — charged separately in '}
                        <span className="font-medium text-foreground">{feeSymbol}</span>
                    </p>
                )}
                {feeConfig &&
                    !feeIsNative &&
                    feeConfig.feeToken !== '0x0000000000000000000000000000000000000000' && (
                        <CopyAddress address={feeConfig.feeToken} label="Fee token CA" />
                    )}
            </div>

            <Button
                className="h-11 w-full text-sm font-semibold"
                onClick={handleAction}
                disabled={!isReady || isBusy}
                isLoading={needsApproval ? isApproving : isSending}
                loadingText={needsApproval ? approveLoadingText : sendLoadingText}
            >
                {getButtonLabel()}
            </Button>
        </div>
    )
}

function Section({
    label,
    action,
    children,
}: {
    label: string
    action?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="rounded-xl border bg-card px-4 py-3.5">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </span>
                {action}
            </div>
            <div className="space-y-3">{children}</div>
        </div>
    )
}
