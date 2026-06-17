'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { getStatus } from '@lifi/sdk'
import { getChainMetadata } from '@/lib/wagmi'
import type { RouteExtended } from '@lifi/sdk'
import type { StatusResponse } from '@lifi/types'
import { CheckCircle2, Clock, Loader2, XCircle, ExternalLink } from 'lucide-react'

interface BridgeStatusProps {
    route: RouteExtended
    onComplete?: () => void
}

type StatusPhase = 'source' | 'bridging' | 'destination' | 'done' | 'failed'

function StatusRow({
    label,
    phase,
    txHash,
    explorerUrl,
}: {
    label: string
    phase: 'pending' | 'active' | 'done' | 'failed'
    txHash?: string
    explorerUrl?: string
}) {
    return (
        <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
                {phase === 'done' && <CheckCircle2 className="h-4 w-4 text-positive" />}
                {phase === 'active' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {phase === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                {phase === 'failed' && <XCircle className="h-4 w-4 text-negative" />}
                <span
                    className={
                        phase === 'done'
                            ? 'text-positive'
                            : phase === 'failed'
                              ? 'text-negative'
                              : phase === 'active'
                                ? 'text-blue-500'
                                : 'text-muted-foreground'
                    }
                >
                    {label}
                </span>
            </div>
            {txHash && explorerUrl && (
                <a
                    href={`${explorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                    View <ExternalLink className="h-3 w-3" />
                </a>
            )}
        </div>
    )
}

export function BridgeStatus({ route, onComplete }: BridgeStatusProps) {
    const [status, setStatus] = useState<StatusResponse | null>(null)
    const [phase, setPhase] = useState<StatusPhase>('source')

    const sourceMeta = getChainMetadata(route.fromChainId)
    const destMeta = getChainMetadata(route.toChainId)

    const pollStatus = useCallback(async () => {
        try {
            const firstStep = route.steps[0]
            const txHash = firstStep?.execution?.process?.find((p) => p.txHash)?.txHash
            const taskId = firstStep?.execution?.process?.find((p) => p.taskId)?.taskId

            if (!txHash && !taskId) return

            const result = await getStatus({
                txHash,
                taskId,
                fromAddress: route.fromAddress,
                toAddress: route.toAddress,
            } as Parameters<typeof getStatus>[0])

            setStatus(result)

            if (result.status === 'DONE') {
                setPhase('done')
                onComplete?.()
            } else if (result.status === 'FAILED') {
                setPhase('failed')
            } else if (result.status === 'PENDING') {
                const hasDestTx = result.substatus === 'COMPLETED'
                setPhase(hasDestTx ? 'destination' : 'bridging')
            }
        } catch {
            /* transient poll error — keep polling */
        }
    }, [route, onComplete])

    useEffect(() => {
        pollStatus()
        const interval = setInterval(pollStatus, 10000)
        return () => clearInterval(interval)
    }, [pollStatus])

    const sourceTx = route.steps[0]?.execution?.process?.find((p) => p.txHash)?.txHash
    const destTx =
        status && 'receiving' in status
            ? (status as { receiving?: { txHash?: string } }).receiving?.txHash
            : undefined

    return (
        <Card className="bg-muted/50">
            <CardContent className="space-y-2 p-3 text-sm">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                    Bridge Status
                </p>
                <StatusRow
                    label={`Source: ${sourceMeta?.name ?? `Chain ${route.fromChainId}`}`}
                    phase={sourceTx ? 'done' : phase === 'source' ? 'active' : 'done'}
                    txHash={sourceTx}
                    explorerUrl={sourceMeta?.explorer}
                />
                <StatusRow
                    label="Bridging"
                    phase={
                        phase === 'bridging'
                            ? 'active'
                            : phase === 'done' || phase === 'destination'
                              ? 'done'
                              : phase === 'failed'
                                ? 'failed'
                                : 'pending'
                    }
                />
                <StatusRow
                    label={`Destination: ${destMeta?.name ?? `Chain ${route.toChainId}`}`}
                    phase={
                        phase === 'done'
                            ? 'done'
                            : phase === 'destination'
                              ? 'active'
                              : phase === 'failed'
                                ? 'failed'
                                : 'pending'
                    }
                    txHash={destTx}
                    explorerUrl={destMeta?.explorer}
                />
            </CardContent>
        </Card>
    )
}
