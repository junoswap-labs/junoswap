const SLIPPAGE_REVERT =
    /insufficient output amount|slippage|too little received|min(imum)? ?(amount|out|received)/i
const MAX_SUGGESTED_PCT = 49

export function isSlippageRevert(error: { message?: string; shortMessage?: string } | null) {
    if (!error) return false
    return SLIPPAGE_REVERT.test(`${error.shortMessage ?? ''} ${error.message ?? ''}`)
}

/** Next slippage % to try after a min-output revert: at least 2%, otherwise 1.5 points above current. */
export function suggestSlippage(currentPct: number) {
    const next = Math.max(2, Math.round((currentPct + 1.5) * 10) / 10)
    return Math.min(next, MAX_SUGGESTED_PCT)
}
