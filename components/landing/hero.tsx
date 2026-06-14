'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

const HeroBackground = dynamic(
    () => import('./hero-background').then((mod) => mod.HeroBackground),
    { ssr: false }
)

export function Hero() {
    const textRef = useRef<HTMLDivElement>(null)
    const sectionRef = useRef<HTMLElement>(null)
    const rafRef = useRef<number>(0)

    // Scroll parallax: text recedes and fades as user scrolls past the hero
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (prefersReducedMotion) return

        const section = sectionRef.current
        const text = textRef.current
        if (!section || !text) return

        // Reduce parallax intensity on mobile where the hero fills more of the viewport
        const isMobile = window.innerWidth < 768

        const onScroll = () => {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                const scrollY = window.scrollY
                const heroHeight = section.offsetHeight
                // Only apply while the hero is partially visible
                if (scrollY >= heroHeight) return

                const progress = Math.min(scrollY / heroHeight, 1)
                const translateY = scrollY * (isMobile ? 0.08 : 0.15)
                const scale = 1 - progress * (isMobile ? 0.03 : 0.05)
                const opacity = 1 - progress * (isMobile ? 0.5 : 0.7)

                text.style.transform = `translateY(${translateY}px) scale(${scale})`
                text.style.opacity = String(Math.max(opacity, 0))
            })
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            cancelAnimationFrame(rafRef.current)
        }
    }, [])

    return (
        <section
            ref={sectionRef}
            className="relative flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden"
        >
            {/* Cool-void fallback (matches the WebGL canvas) shown during SSR / before it loads */}
            <div className="absolute inset-0 -z-10 bg-[#04050B] bg-[radial-gradient(ellipse_46%_38%_at_50%_52%,hsl(28_100%_60%_/_0.10),transparent_70%)]" />
            <HeroBackground />
            <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div ref={textRef} className="mx-auto max-w-3xl text-center lg:max-w-4xl">
                    <h1
                        className="animate-reveal-up text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-[hsl(210,20%,98%)] sm:text-5xl lg:text-6xl xl:text-7xl"
                        style={{ animationDelay: '0.4s', animationDuration: '1.1s' }}
                    >
                        Trade, Launch & Win
                        <span className="whitespace-nowrap bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-transparent">
                            {' '}
                            Everything
                        </span>
                    </h1>
                    <p
                        className="animate-reveal-up mx-auto mt-5 max-w-xl text-balance text-lg leading-8 text-[hsl(220,10%,64%)] sm:mt-6 sm:text-xl"
                        style={{ animationDelay: '0.65s', animationDuration: '1.1s' }}
                    >
                        Best rates. Any chain. One platform.
                    </p>
                    <div
                        className="animate-reveal-up mt-9 sm:mt-11"
                        style={{ animationDelay: '0.9s', animationDuration: '1.1s' }}
                    >
                        <Link href="/swap">
                            <Button size="xl" className="group w-full sm:w-auto">
                                Start Swapping
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Subtle scroll cue */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center motion-safe:animate-reveal-up"
                style={{ animationDelay: '1.6s', animationDuration: '1.1s' }}
            >
                <ChevronDown
                    className="h-6 w-6 text-[hsl(220,12%,68%)] motion-safe:animate-hero-bob"
                    aria-hidden="true"
                />
            </div>
        </section>
    )
}
