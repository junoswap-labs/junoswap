'use client'

import { useEffect, useState } from 'react'

/**
 * Infinite scroll over an in-memory list: renders `batch` items at a time and grows the window
 * when the sentinel scrolls near the viewport. `resetKey` drops it back to one batch (filter/sort).
 */
export function useInfiniteList<T>(items: readonly T[], batch: number, resetKey: string) {
    const [count, setCount] = useState(batch)
    // State, not a ref object: the sentinel can mount well after the list data arrives (behind a
    // skeleton), and only a state change re-runs the effect that has to observe it.
    const [sentinel, sentinelRef] = useState<HTMLDivElement | null>(null)
    const hasMore = count < items.length

    useEffect(() => setCount(batch), [batch, resetKey])

    useEffect(() => {
        if (!sentinel) return
        const observer = new IntersectionObserver(
            ([entry]) => entry?.isIntersecting && setCount((n) => n + batch),
            { rootMargin: '400px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
        // `count` re-arms the observer: a sentinel still in view after a batch must fire again.
    }, [sentinel, count, batch])

    return { shown: items.slice(0, count), hasMore, sentinelRef }
}
