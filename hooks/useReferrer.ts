'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Address } from 'viem'
import { normalizeReferrer, DEFAULT_REFERRER } from '@/lib/swap-tracking'
import { useReferralStore } from '@/store/referral-store'

/**
 * Referral address for calldata tracking, sourced from the `?ref=` URL param
 * with a persisted fallback so it survives navigation/reload until the user's
 * first tagged swap. Latest-wins: a valid `?ref=` overwrites the stored value.
 * Falls back to DEFAULT_REFERRER when neither source has a valid address.
 */
export function useReferrer(): Address {
    const searchParams = useSearchParams()
    const urlRef = searchParams.get('ref')
    const storedRef = useReferralStore((s) => s.referrer)
    const setReferrer = useReferralStore((s) => s.setReferrer)

    useEffect(() => {
        if (!urlRef) return
        const normalized = normalizeReferrer(urlRef)
        if (
            normalized !== DEFAULT_REFERRER &&
            normalized.toLowerCase() !== storedRef?.toLowerCase()
        ) {
            setReferrer(normalized)
        }
    }, [urlRef, storedRef, setReferrer])

    // URL takes priority; the persisted value is the fallback after navigation.
    return useMemo(() => {
        const fromUrl = normalizeReferrer(urlRef)
        if (fromUrl !== DEFAULT_REFERRER) return fromUrl
        return normalizeReferrer(storedRef)
    }, [urlRef, storedRef])
}
