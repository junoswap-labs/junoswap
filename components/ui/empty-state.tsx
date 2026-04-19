'use client'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
    icon?: React.ComponentType<{ className?: string }>
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
    compact?: boolean
    variant?: 'default' | 'subtle' | 'error'
    animated?: boolean
}

const iconColors = {
    default: 'text-muted-foreground',
    subtle: 'text-muted-foreground/70',
    error: 'text-muted-foreground',
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
    compact,
    variant = 'default',
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center',
                compact ? 'gap-3 py-12 px-6' : 'gap-4 py-20 px-8',
                className
            )}
        >
            {Icon && (
                <div
                    className={cn(
                        'relative mx-auto flex items-center justify-center',
                        compact ? 'h-24 w-24' : 'h-32 w-32'
                    )}
                >
                    <div className="absolute inset-0 rounded-full bg-muted/30" />
                    <Icon
                        className={cn(
                            'relative z-10 shrink-0',
                            iconColors[variant],
                            compact ? 'h-[4.5rem] w-[4.5rem]' : 'h-[6.5rem] w-[6.5rem]'
                        )}
                    />
                </div>
            )}
            <h3
                className={cn(
                    'font-semibold tracking-tight text-foreground',
                    compact ? 'text-base' : 'text-xl'
                )}
            >
                {title}
            </h3>
            {description && (
                <p
                    className={cn(
                        'leading-relaxed text-muted-foreground/70',
                        compact ? 'max-w-xs text-xs' : 'max-w-md text-sm'
                    )}
                >
                    {description}
                </p>
            )}
            {action && <div className={compact ? 'mt-2' : 'mt-3'}>{action}</div>}
        </div>
    )
}
