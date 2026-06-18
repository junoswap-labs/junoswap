'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Address } from 'viem'
import { normalizeReferrer } from '@/lib/swap-tracking'

/**
 * Referral address for calldata tracking, sourced from the `?ref=` URL param.
 * Falls back to DEFAULT_REFERRER when the param is absent or not a valid address.
 */
export function useReferrer(): Address {
    const searchParams = useSearchParams()
    const ref = searchParams.get('ref')
    return useMemo(() => normalizeReferrer(ref), [ref])
}
