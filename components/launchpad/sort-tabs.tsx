'use client'

import { cn } from '@/lib/utils'
import type { LaunchpadSortKey } from '@/types/launchpad'

interface SortTabsProps {
    value: LaunchpadSortKey
    onChange: (value: LaunchpadSortKey) => void
}

const SORT_OPTIONS: { key: LaunchpadSortKey; label: string }[] = [
    { key: 'last-trade', label: 'Last Trade' },
    { key: 'market-cap', label: 'Market Cap' },
    { key: 'new', label: 'New' },
    { key: 'oldest', label: 'Oldest' },
]

export function SortTabs({ value, onChange }: SortTabsProps) {
    return (
        <div className="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {SORT_OPTIONS.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                        value === key
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}
