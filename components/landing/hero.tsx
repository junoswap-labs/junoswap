'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const HeroBackground = dynamic(
    () => import('./hero-background').then((mod) => mod.HeroBackground),
    { ssr: false }
)

export function Hero() {
    return (
        <section className="relative flex min-h-[100dvh] items-center overflow-hidden">
            {/* CSS gradient fallback shown during SSR / before WebGL loads */}
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_60%,hsl(0_100%_60%_/_0.08),hsl(23_100%_65%_/_0.06),transparent)]" />
            <HeroBackground />
            <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-3xl text-center">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                        Trade, Launch & Win
                        <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-transparent">
                            {' '}
                            Everything
                        </span>
                    </h1>
                    <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
                        Best rates. Any chain. One platform.
                    </p>
                    <div className="mt-10">
                        <Link href="/swap">
                            <Button size="xl" className="group w-full sm:w-auto">
                                Start Swapping
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
