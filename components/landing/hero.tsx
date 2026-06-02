'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
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
            className="relative flex min-h-[100dvh] items-center overflow-hidden"
        >
            {/* CSS gradient fallback shown during SSR / before WebGL loads */}
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_60%,hsl(0_100%_60%_/_0.08),hsl(23_100%_65%_/_0.06),transparent)]" />
            <HeroBackground />
            <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div ref={textRef} className="mx-auto max-w-3xl text-center lg:max-w-4xl">
                    <h1
                        className="animate-reveal-up text-4xl font-bold tracking-tight text-[hsl(210,20%,98%)] sm:text-5xl lg:text-6xl xl:text-7xl"
                        style={{ animationDelay: '0.3s' }}
                    >
                        Trade, Launch & Win
                        <span className="whitespace-nowrap bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-transparent">
                            {' '}
                            Everything
                        </span>
                    </h1>
                    <p
                        className="animate-reveal-up mt-4 text-lg leading-8 text-[hsl(220,8%,55%)] sm:mt-6 sm:text-xl"
                        style={{ animationDelay: '0.5s' }}
                    >
                        Best rates. Any chain. One platform.
                    </p>
                    <div
                        className="animate-reveal-up mt-8 sm:mt-10"
                        style={{ animationDelay: '0.7s' }}
                    >
                        <Link href="/swap">
                            <Button
                                size="xl"
                                className="group w-full bg-[hsl(210,20%,98%)] text-[hsl(230,15%,3.5%)] hover:bg-[hsl(210,20%,98%)/0.9] active:bg-[hsl(210,20%,98%)/0.8] sm:w-auto"
                            >
                                Start Swapping
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
