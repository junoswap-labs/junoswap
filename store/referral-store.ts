import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ReferralStore {
    referrer: string | null
    setReferrer: (ref: string) => void
}

// Persists the referrer so it survives navigation/reload until the user's first
// tagged swap establishes the sticky on-chain binding. Latest-wins: a valid
// ?ref= in the URL overwrites this (see hooks/useReferrer.ts).
export const useReferralStore = create<ReferralStore>()(
    persist(
        (set) => ({
            referrer: null,
            setReferrer: (referrer) => set({ referrer }),
        }),
        { name: 'junoswap-referral' }
    )
)
