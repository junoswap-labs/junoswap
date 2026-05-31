'use client'

import { type FC } from 'react'
import { GitBranch, Repeat, Rocket } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'

interface Feature {
    name: string
    description: string
    icon: LucideIcon
    href: string
}

const features: Feature[] = [
    {
        name: 'Aggregate Swap',
        description:
            'Find the best rates across multiple DEXs with intelligent routing. Junoswap aggregates liquidity sources to get you the optimal price on every trade.',
        icon: Repeat,
        href: '/swap',
    },
    {
        name: 'Cross-Chain Bridge',
        description:
            'Seamlessly move assets between chains with one click. Fast, secure transfers powered by trusted bridge providers — no wrapping or manual steps required.',
        icon: GitBranch,
        href: '/bridge',
    },
    {
        name: 'Memecoin Launchpad',
        description:
            'Launch and discover the next memecoin on a fair-launch bonding curve. Trade early, earn points, and be part of the community from day one.',
        icon: Rocket,
        href: '/launchpad',
    },
]

function SwapVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {/* Radial center glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,hsl(0_100%_60%_/_0.12),transparent)]" />

            {/* Routing path circles */}
            <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
            <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute top-1/4 right-1/4 h-24 w-24 rounded-full bg-[#FF914D]/5 blur-xl" />

            {/* Route dots and dashed connections */}
            <div className="absolute top-[30%] left-[20%] h-2 w-2 rounded-full bg-primary/30" />
            <div className="absolute top-[45%] left-[30%] h-1.5 w-1.5 rounded-full bg-primary/20" />
            <div className="absolute top-[60%] left-[70%] h-2 w-2 rounded-full bg-[#FF914D]/25" />
            <div className="absolute top-[25%] right-[25%] h-1.5 w-1.5 rounded-full bg-primary/20" />

            {/* Dashed path lines */}
            <div className="absolute top-[35%] left-[22%] h-px w-[30%] rotate-[25deg] border-t border-dashed border-primary/15" />
            <div className="absolute top-[55%] left-[35%] h-px w-[35%] -rotate-[15deg] border-t border-dashed border-primary/10" />

            {/* Central icon */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5"
                    style={{ animationDuration: '8s' }}
                >
                    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-card">
                        <Repeat
                            className="h-10 w-10 animate-spin text-primary"
                            style={{ animationDuration: '8s' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

function BridgeVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {/* Horizontal gradient band */}
            <div className="absolute inset-y-[35%] left-0 right-0 h-[30%] bg-gradient-to-r from-primary/5 via-primary/10 to-[#FF914D]/5" />

            {/* Chain pillars */}
            <div className="absolute left-[10%] top-[25%] flex h-[50%] w-[18%] flex-col items-center justify-center gap-2 rounded-xl border border-border/30 bg-muted/30">
                <div className="h-8 w-8 rounded-full border border-border/30 bg-muted-foreground/10" />
                <div className="h-1.5 w-10 rounded bg-muted-foreground/10" />
                <div className="h-1 w-8 rounded bg-muted-foreground/5" />
            </div>
            <div className="absolute right-[10%] top-[25%] flex h-[50%] w-[18%] flex-col items-center justify-center gap-2 rounded-xl border border-border/30 bg-muted/30">
                <div className="h-8 w-8 rounded-full border border-border/30 bg-muted-foreground/10" />
                <div className="h-1.5 w-10 rounded bg-muted-foreground/10" />
                <div className="h-1 w-8 rounded bg-muted-foreground/5" />
            </div>

            {/* Dashed connecting line */}
            <div className="absolute top-[50%] left-[28%] h-0 w-[44%] -translate-y-1/2 border-t border-dashed border-primary/20" />

            {/* Animated transfer dot */}
            <div className="absolute top-[50%] h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary to-[#FF914D] animate-transfer-dot" />

            {/* Central icon */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5">
                    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-card">
                        <GitBranch className="h-10 w-10 text-primary" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function LaunchpadVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {/* Cone-shaped gradient from bottom */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_50%_80%,hsl(0_100%_60%_/_0.15),transparent)]" />

            {/* Gold sparkle diamonds */}
            <div className="absolute top-[20%] left-[30%] h-3 w-3 rotate-45 bg-[#FFD700]/30" />
            <div className="absolute top-[15%] right-[25%] h-2 w-2 rotate-45 bg-[#FFD700]/20 animate-pulse" />
            <div className="absolute bottom-[35%] left-[20%] h-2.5 w-2.5 rotate-45 bg-[#FFD700]/25" />
            <div className="absolute top-[40%] right-[15%] h-2 w-2 rotate-45 bg-[#FFD700]/20 animate-pulse" />
            <div className="absolute bottom-[25%] right-[35%] h-1.5 w-1.5 rotate-45 bg-[#FFD700]/30" />

            {/* Emission lines below rocket */}
            <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
                <div className="h-1 w-10 rounded-full bg-primary/25" />
                <div className="h-1 w-7 rounded-full bg-primary/15" />
                <div className="h-1 w-4 rounded-full bg-primary/5" />
            </div>

            {/* Central icon */}
            <div className="absolute inset-0 flex items-center justify-center -translate-y-3">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5">
                    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-card">
                        <Rocket className="h-10 w-10 text-primary" />
                    </div>
                </div>
            </div>
        </div>
    )
}

const visualComponents: FC[] = [SwapVisual, BridgeVisual, LaunchpadVisual]

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
    const isReversed = index % 2 !== 0
    const Visual = visualComponents[index]!
    const reveal = useScrollReveal({ threshold: 0.15 })

    return (
        <div
            ref={reveal.ref as React.RefObject<HTMLDivElement>}
            data-reveal
            className={cn(
                'group grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16',
                'animate-reveal-up',
                reveal.isVisible && 'is-visible'
            )}
        >
            {/* Visual area */}
            <div
                className={cn(
                    'relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border/30 bg-card transition-colors duration-500 shadow-[0_0_60px_-15px_hsl(0_100%_60%_/_0.15)]',
                    isReversed && 'lg:order-last',
                    'animate-reveal-scale'
                )}
            >
                <Visual />
            </div>

            {/* Text area */}
            <div className={cn('flex flex-col gap-4', isReversed && 'lg:order-first')}>
                <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{feature.name}</h3>
                <p className="text-md leading-relaxed text-muted-foreground">
                    {feature.description}
                </p>
            </div>
        </div>
    )
}

export function Features() {
    const headingReveal = useScrollReveal({ threshold: 0.2 })

    return (
        <section className="py-20 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                {/* Section heading */}
                <div className="mx-auto max-w-2xl text-center">
                    <h2
                        ref={headingReveal.ref as React.RefObject<HTMLHeadingElement>}
                        data-reveal
                        className={cn(
                            'mt-2 text-3xl font-bold tracking-tight sm:text-4xl',
                            'animate-reveal-up',
                            headingReveal.isVisible && 'is-visible'
                        )}
                    >
                        One platform for swapping, bridging, and launching across every chain.
                    </h2>
                </div>

                {/* Feature rows — each observed independently */}
                <div className="mt-16 space-y-20 sm:mt-20 lg:space-y-32">
                    {features.map((feature, index) => (
                        <FeatureRow key={feature.name} feature={feature} index={index} />
                    ))}
                </div>
            </div>
        </section>
    )
}
