'use client'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
    title: string
    description?: string
    action?: React.ReactNode
    className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center gap-4 py-20 px-8',
                className
            )}
        >
            <h3 className="font-semibold tracking-tight text-xl text-foreground">{title}</h3>
            {description && (
                <p className="leading-relaxed text-sm max-w-md text-muted-foreground/70">
                    {description}
                </p>
            )}
            {action && <div className="mt-3">{action}</div>}
        </div>
    )
}
