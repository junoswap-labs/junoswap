import type { Metadata } from 'next'
import { fetchLaunchTokenMeta } from '@/lib/launchpad-og'

interface TokenLayoutProps {
    children: React.ReactNode
    params: Promise<{ address: string }>
}

export async function generateMetadata({
    params,
}: Pick<TokenLayoutProps, 'params'>): Promise<Metadata> {
    const { address } = await params
    const token = await fetchLaunchTokenMeta(address)

    if (!token || !token.symbol) {
        return { title: 'Token — Junoswap Launchpad' }
    }

    const title = `${token.symbol} — ${token.name} | Junoswap Launchpad`
    const description =
        token.description ||
        `Trade ${token.symbol} on Junoswap Launchpad. Buy, sell, and track ${token.name} in real time.`

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    }
}

export default function TokenLayout({ children }: TokenLayoutProps) {
    return children
}
