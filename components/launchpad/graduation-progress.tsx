'use client'

import { cn } from '@/lib/utils'
import { calculateGraduationProgress, formatKub, isReadyToGraduate } from '@/services/launchpad'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface GraduationProgressProps {
    nativeReserve: bigint
    graduationAmount: bigint
    isGraduated: boolean
    isGraduating?: boolean
    onGraduate?: () => void
    className?: string
}

export function GraduationProgress({
    nativeReserve,
    graduationAmount,
    isGraduated,
    isGraduating = false,
    onGraduate,
    className,
}: GraduationProgressProps) {
    if (isGraduated) {
        return (
            <Badge variant="default" className="bg-green-600 text-white">
                Graduated
            </Badge>
        )
    }

    const ready = isReadyToGraduate(nativeReserve, graduationAmount, isGraduated)
    const progress = calculateGraduationProgress(nativeReserve, graduationAmount)

    if (ready) {
        return (
            <div className={cn('space-y-1.5', className)}>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                            width: '100%',
                            background:
                                'linear-gradient(90deg, rgb(245 158 11 / 0.3), rgb(245 158 11))',
                        }}
                    />
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-amber-500 font-medium">Ready to Graduate</span>
                    <span className="text-muted-foreground">100%</span>
                </div>
                {onGraduate && (
                    <Button
                        size="sm"
                        className="w-full bg-amber-500 text-white hover:bg-amber-600"
                        onClick={onGraduate}
                        disabled={isGraduating}
                    >
                        {isGraduating ? 'Graduating...' : 'Graduate Token'}
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div className={cn('space-y-1', className)}>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                        width: `${Math.min(progress, 100)}%`,
                        background: `linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary)))`,
                    }}
                />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <div className="text-xs text-muted-foreground">
                    {formatKub(nativeReserve)} / {formatKub(graduationAmount)} KUB
                </div>
                <span>{progress.toFixed(1)}%</span>
            </div>
        </div>
    )
}
