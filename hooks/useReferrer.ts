'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { isAddress, type Address } from 'viem'
import { useReferralStore } from '@/store/referral-store'

function resolveReferrer(raw: string | null | undefined): Address | null {
    return raw && isAddress(raw) ? (raw as Address) : null
}

export function useReferrer(): Address | null {
    const searchParams = useSearchParams()
    const urlRef = searchParams.get('ref')
    const storedRef = useReferralStore((s) => s.referrer)
    const setReferrer = useReferralStore((s) => s.setReferrer)

    useEffect(() => {
        if (!urlRef) return
        const normalized = resolveReferrer(urlRef)
        if (normalized && normalized.toLowerCase() !== storedRef?.toLowerCase()) {
            setReferrer(normalized)
        }
    }, [urlRef, storedRef, setReferrer])

    return useMemo(() => resolveReferrer(urlRef) ?? resolveReferrer(storedRef), [urlRef, storedRef])
}
