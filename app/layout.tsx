import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Header } from '@/components/layout/header'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    metadataBase: new URL('https://junoswap.trade'),
    title: 'Junoswap — Web3 Aggregation Platform',
    description:
        'Compare DEX rates across multiple chains. Swap tokens at the best price, bridge instantly, and launch your own memecoin — all on Junoswap.',
    keywords: [
        'DeFi',
        'DEX aggregator',
        'token swap',
        'cross-chain bridge',
        'memecoin launchpad',
        'Web3',
        'crypto swap',
        'best swap rates',
    ],
    icons: {
        icon: '/favicon.ico',
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <Providers>
                    <Header />
                    <main>{children}</main>
                    <Toaster />
                </Providers>
            </body>
        </html>
    )
}
