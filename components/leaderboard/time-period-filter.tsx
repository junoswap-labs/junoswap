'use client'

import { cn } from '@/lib/utils'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

interface TimePeriodFilterProps {
    value: LeaderboardTimePeriod
    onChange: (value: LeaderboardTimePeriod) => void
}

const PERIODS: { key: LeaderboardTimePeriod; label: string }[] = [
    { key: '24h', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: 'all', label: 'All Time' },
]

export function TimePeriodFilter({ value, onChange }: TimePeriodFilterProps) {
    return (
        <div className="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {PERIODS.map(({ key, label }) => (
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
