// Bonding-curve constants the launchpad UI needs. These mirror the values the on-chain
// curve uses; the SDK keeps its own private copies for its math helpers.

// Whole tokens, for market caps computed against a float price.
export const TOTAL_SUPPLY = 1_000_000_000

// Wei. The full supply a curve holds before any buys.
export const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n
