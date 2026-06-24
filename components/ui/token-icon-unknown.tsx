import { cn } from '@/lib/utils'

interface UnknownTokenIconProps {
    size?: 'xs' | 'sm' | 'md' | 'lg'
    className?: string
}

const SIZE_MAP = {
    xs: 20,
    sm: 32,
    md: 36,
    lg: 48,
}

export function UnknownTokenIcon({ size = 'sm', className }: UnknownTokenIconProps) {
    const px = SIZE_MAP[size]
    return (
        <svg
            width={px}
            height={px}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn('shrink-0', className)}
            aria-label="Unknown token"
        >
            {/* Coin body */}
            <circle cx="20" cy="20" r="19" fill="currentColor" className="text-muted" />
            <circle
                cx="20"
                cy="20"
                r="19"
                stroke="currentColor"
                className="text-border"
                strokeWidth="1.5"
            />

            {/* Inner rim */}
            <circle
                cx="20"
                cy="20"
                r="15"
                stroke="currentColor"
                className="text-border/50"
                strokeWidth="1"
                strokeDasharray="2 2"
            />

            {/* Shine highlight */}
            <ellipse
                cx="15"
                cy="13"
                rx="4"
                ry="2.5"
                fill="white"
                fillOpacity="0.15"
                transform="rotate(-30 15 13)"
            />

            {/* Question mark */}
            <text
                x="20"
                y="26"
                textAnchor="middle"
                fontSize="18"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
                fill="currentColor"
                className="text-muted-foreground"
            >
                ?
            </text>
        </svg>
    )
}
