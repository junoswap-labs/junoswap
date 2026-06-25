'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type TokenIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAP: Record<TokenIconSize, { container: string; text: string }> = {
    xs: { container: 'h-5 w-5', text: 'text-[9px]' },
    sm: { container: 'h-8 w-8', text: 'text-[10px]' },
    md: { container: 'h-9 w-9', text: 'text-[11px]' },
    lg: { container: 'h-12 w-12', text: 'text-sm' },
    xl: { container: 'h-20 w-20', text: 'text-xl' },
}

function getInitials(symbol: string | null | undefined): string {
    if (!symbol) return '?'
    const cleaned = symbol.replace(/[^a-zA-Z0-9]/g, '')
    if (!cleaned) return '?'
    return cleaned.slice(0, 2).toUpperCase()
}

export interface TokenIconProps {
    /** Image URL for the token logo */
    src?: string | null
    /** Token symbol — used to generate fallback initials */
    symbol?: string | null
    /** Preset size */
    size?: TokenIconSize
    /** Shape: circle (default, inline/lists) or square (launchpad cards) */
    variant?: 'circle' | 'square'
    className?: string
}

export function TokenIcon({
    src,
    symbol,
    size = 'sm',
    variant = 'circle',
    className,
}: TokenIconProps) {
    const { container, text } = SIZE_MAP[size]
    const shape = variant === 'square' ? 'rounded-xl' : 'rounded-full'
    const fallbackStyle = cn(text, 'bg-primary/15 text-primary font-semibold')

    // No logo: render the initials badge directly rather than relying on Radix's
    // image-fallback path, so logo-less tokens (imported / external V3) always show a
    // legible icon instead of an empty circle.
    if (!src) {
        return (
            <span
                className={cn(
                    container,
                    shape,
                    'flex shrink-0 items-center justify-center overflow-hidden',
                    fallbackStyle,
                    className
                )}
            >
                {getInitials(symbol)}
            </span>
        )
    }

    return (
        <Avatar className={cn(container, 'shrink-0', shape, className)}>
            <AvatarImage src={src} alt={symbol ?? 'Token'} />
            <AvatarFallback className={fallbackStyle}>{getInitials(symbol)}</AvatarFallback>
        </Avatar>
    )
}

export interface TokenIconPairProps {
    src0?: string | null
    symbol0?: string | null
    src1?: string | null
    symbol1?: string | null
    size?: TokenIconSize
    className?: string
}

export function TokenIconPair({
    src0,
    symbol0,
    src1,
    symbol1,
    size = 'sm',
    className,
}: TokenIconPairProps) {
    return (
        <div className={cn('flex -space-x-2', className)}>
            <TokenIcon
                src={src0}
                symbol={symbol0}
                size={size}
                className="border-2 border-background"
            />
            <TokenIcon
                src={src1}
                symbol={symbol1}
                size={size}
                className="border-2 border-background"
            />
        </div>
    )
}

export interface TokenIconSkeletonProps {
    size?: TokenIconSize
    variant?: 'circle' | 'square'
    className?: string
}

export function TokenIconSkeleton({
    size = 'md',
    variant = 'circle',
    className,
}: TokenIconSkeletonProps) {
    const { container } = SIZE_MAP[size]

    return (
        <div
            className={cn(
                container,
                'shrink-0 animate-pulse bg-muted',
                variant === 'circle' ? 'rounded-full' : 'rounded-xl',
                className
            )}
        />
    )
}
