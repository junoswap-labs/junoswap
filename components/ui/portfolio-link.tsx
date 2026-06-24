import Link from 'next/link'
import { formatAddress, cn } from '@/lib/utils'

interface PortfolioLinkProps {
    address: string
    className?: string
    startChars?: number
    endChars?: number
}

export function PortfolioLink({ address, className, startChars, endChars }: PortfolioLinkProps) {
    return (
        <Link
            href={`/portfolio?address=${address}`}
            title={address}
            className={cn(
                'font-mono text-muted-foreground transition-colors hover:text-foreground',
                className
            )}
        >
            {formatAddress(address, startChars, endChars)}
        </Link>
    )
}
