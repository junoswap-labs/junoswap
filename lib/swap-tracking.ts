import { concat, isAddress, type Address, type Hex } from 'viem'

// Magic prefix the indexer scans for at the tail of a swap's calldata: ASCII "juno".
// Standard Uniswap V2/V3 router ABIs ignore trailing calldata, so appending
// `MARKER + referrer` after the encoded args is a no-op for execution but lets the
// indexer attribute the swap to this frontend (and to a referral link). Same idea
// as 1inch/0x affiliate tags. Applied to every router (including Junoswap's own).
export const JUNOSWAP_CALLDATA_MARKER = '0x6a756e6f' as const // "juno"

// Used when no (or an invalid) ?ref= param is present. Zero address = "frontend
// originated, no referrer".
export const DEFAULT_REFERRER: Address = '0x0000000000000000000000000000000000000000'

/** marker (4 bytes) + referrer (20 bytes) = 24-byte suffix. */
export function buildTrackingSuffix(referrer: Address): Hex {
    return concat([JUNOSWAP_CALLDATA_MARKER, referrer])
}

export function appendTrackingTag(data: Hex, referrer: Address): Hex {
    return concat([data, buildTrackingSuffix(referrer)])
}

export function normalizeReferrer(raw: string | null | undefined): Address {
    return raw && isAddress(raw) ? (raw as Address) : DEFAULT_REFERRER
}
