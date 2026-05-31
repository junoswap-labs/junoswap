'use client'

import { useEffect, useRef, useState } from 'react'

interface ScrollRevealOptions {
    threshold?: number
    rootMargin?: string
    triggerOnce?: boolean
}

/**
 * Observes a single element and reveals it when it enters the viewport.
 * Respects `prefers-reduced-motion` — immediately visible if reduced motion is preferred.
 */
export function useScrollReveal({
    threshold = 0.15,
    rootMargin = '0px 0px -50px 0px',
    triggerOnce = true,
}: ScrollRevealOptions = {}) {
    const ref = useRef<HTMLElement>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        if (prefersReducedMotion) {
            setIsVisible(true)
            return
        }

        const el = ref.current
        if (!el) return

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0]
                if (!entry) return
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    if (triggerOnce) observer.unobserve(entry.target)
                } else if (!triggerOnce) {
                    setIsVisible(false)
                }
            },
            { threshold, rootMargin }
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [threshold, rootMargin, triggerOnce])

    return { ref, isVisible }
}

interface ScrollRevealGroupOptions extends ScrollRevealOptions {
    staggerDelay?: number
}

/**
 * Observes a container element and reveals its children with staggered delays.
 * Sets `--stagger-index` on each child matching `selector` and adds `is-visible`
 * to the container when it enters the viewport. CSS handles per-child animation
 * delays via the custom property.
 */
export function useScrollRevealGroup(
    selector: string,
    {
        threshold = 0.1,
        rootMargin = '0px 0px -50px 0px',
        triggerOnce = true,
        staggerDelay = 80,
    }: ScrollRevealGroupOptions = {}
) {
    const ref = useRef<HTMLElement>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        if (prefersReducedMotion) {
            setIsVisible(true)
            return
        }

        const el = ref.current
        if (!el) return

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0]
                if (!entry) return
                if (entry.isIntersecting) {
                    const children = el.querySelectorAll<HTMLElement>(selector)
                    children.forEach((child, index) => {
                        child.style.setProperty('--stagger-index', String(index))
                        child.style.setProperty('--stagger-step', `${staggerDelay}ms`)
                    })
                    setIsVisible(true)
                    if (triggerOnce) observer.unobserve(entry.target)
                } else if (!triggerOnce) {
                    setIsVisible(false)
                }
            },
            { threshold, rootMargin }
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [selector, threshold, rootMargin, triggerOnce, staggerDelay])

    return { ref, isVisible }
}
