// Mirror of lib/swap-tracking.ts on the frontend. The frontend appends
// `MARKER + referrer` (4 + 20 bytes) to the tail of a non-Junoswap swap's
// calldata; standard router ABIs ignore trailing bytes, so we recover the tag
// here from the raw transaction input.
//
// The suffix carries two distinct facts, returned separately:
//   - marker presence  => the swap came through our frontend (viaFrontend)
//   - referrer address  => optional ?ref= attribution (null when the appended
//                          address was zero, i.e. no referral link was used)
const MARKER = '6a756e6f' // ASCII "juno"
const ZERO = '0x0000000000000000000000000000000000000000'
const SUFFIX_HEX_LEN = 48 // (4-byte marker + 20-byte address) * 2

export function parseTrackingTag(
    input: string | undefined | null
): { referrer: string | null } | null {
    if (!input) return null
    const data = input.toLowerCase()
    if (data.length < 2 + SUFFIX_HEX_LEN) return null
    const suffix = data.slice(-SUFFIX_HEX_LEN)
    if (!suffix.startsWith(MARKER)) return null
    const referrer = '0x' + suffix.slice(MARKER.length)
    return { referrer: referrer === ZERO ? null : referrer }
}
