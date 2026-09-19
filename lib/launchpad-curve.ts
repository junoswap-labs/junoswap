// Bonding-curve constants the launchpad UI needs. These mirror the values the on-chain
// curve uses; the SDK keeps its own private copies for its math helpers.

// Whole tokens, for market caps computed against a float price.
export const TOTAL_SUPPLY = 1_000_000_000

// durianfun.xyz shows mcap as price × 2e9 even though the ERC20 totalSupply() is 1e9. Not a typo:
// it is their own display base, shown only as a side reference next to our real (1e9) mcap.
export const DURIANFUN_MCAP_SUPPLY = 2_000_000_000

// Wei. The full supply a curve holds before any buys.
export const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n

// Mirrors the SDK's internal curve union. V1 graduates on an implicit price threshold; V1.1
// graduates at a flat native reserve.
export type GraduationMode = 'implicit' | 'flat'

// The indexer's id for the V1.1 curve, which is the only curve that differs from V1 here.
export const LAUNCHPAD_V1_1_ID = 'junoswap-v1_1'

export function getGraduationMode(launchpadId?: string): GraduationMode {
    return launchpadId === LAUNCHPAD_V1_1_ID ? 'flat' : 'implicit'
}
