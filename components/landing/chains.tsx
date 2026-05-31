'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useScrollRevealGroup } from '@/hooks/use-scroll-reveal'

const liveChains = [
    { name: 'KUB Chain', icon: '/chains/kubchain.png' },
    { name: 'JB Chain', icon: '/chains/jbchain.png' },
    { name: 'Worldchain', icon: '/chains/worldchain.svg', lightInvert: true },
    { name: 'Base', icon: '/chains/base_white.svg', lightInvert: true },
    { name: 'BNB Chain', icon: '/chains/bnbchain_white.svg', lightInvert: true },
]

export function Chains() {
    const { ref, isVisible } = useScrollRevealGroup('[data-reveal]', {
        threshold: 0.15,
        staggerDelay: 100,
    })

    return (
        <section className="relative overflow-hidden border-y border-border/30">
            {/* Decorative radial gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(0_100%_60%_/_0.05),transparent)] pointer-events-none" />

            <div
                ref={ref as React.RefObject<HTMLDivElement>}
                className={cn(
                    'relative mx-auto max-w-7xl px-6 py-20 sm:py-32 lg:px-8',
                    isVisible && 'is-visible'
                )}
            >
                {/* Two-part heading — matches Features/CTA pattern */}
                <div className="mx-auto max-w-2xl text-center">
                    <p
                        data-reveal
                        className={cn(
                            'mt-2 text-3xl font-bold tracking-tight sm:text-4xl',
                            'animate-reveal-up',
                            isVisible && 'is-visible'
                        )}
                    >
                        Trade across multiple chains
                    </p>
                </div>

                {/* Chain grid */}
                <div className="mx-auto mt-16 grid max-w-2xl grid-cols-2 gap-8 sm:mt-20 sm:grid-cols-5 sm:gap-10">
                    {liveChains.map((chain, i) => (
                        <div
                            key={chain.name}
                            data-reveal
                            className={cn(
                                'flex flex-col items-center gap-4',
                                'animate-reveal-blur',
                                isVisible && 'is-visible'
                            )}
                            style={
                                {
                                    '--stagger-index': i + 1,
                                    '--stagger-step': '100ms',
                                } as React.CSSProperties
                            }
                        >
                            <Image
                                src={chain.icon}
                                alt={chain.name}
                                width={128}
                                height={128}
                                className={cn(
                                    'h-10 w-10 grayscale transition-transform duration-200',
                                    chain.lightInvert &&
                                        'invert opacity-50 dark:invert-0 dark:opacity-100'
                                )}
                            />
                            <span className="text-sm font-medium text-muted-foreground">
                                {chain.name}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
