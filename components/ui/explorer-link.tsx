import { formatAddress, cn } from '@/lib/utils'
import { getExplorerTxUrl, getExplorerAddressUrl, getExplorerTokenUrl } from '@/lib/explorer'

type ExplorerLinkType = 'address' | 'tx' | 'token'

interface ExplorerLinkProps {
    value: string
    type: ExplorerLinkType
    chainId: number
    className?: string
    compact?: boolean
    startChars?: number
    endChars?: number
}

function getUrl(type: ExplorerLinkType, chainId: number, value: string): string {
    switch (type) {
        case 'tx':
            return getExplorerTxUrl(chainId, value)
        case 'address':
            return getExplorerAddressUrl(chainId, value)
        case 'token':
            return getExplorerTokenUrl(chainId, value)
    }
}

export function ExplorerLink({
    value,
    type,
    chainId,
    className,
    compact = false,
    startChars,
    endChars,
}: ExplorerLinkProps) {
    const href = getUrl(type, chainId, value)
    const display = formatAddress(value, startChars, endChars)

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={value}
            className={cn(
                compact
                    ? 'font-mono text-muted-foreground hover:text-foreground transition-colors'
                    : 'inline-flex items-center gap-1 font-mono text-primary/70 hover:text-primary transition-colors',
                className
            )}
        >
            {display}
        </a>
    )
}
