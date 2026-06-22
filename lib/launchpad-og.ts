/**
 * Server-side launchpad token lookup for OG images / page metadata.
 * Talks to Ponder directly via PONDER_URL (never imported client-side).
 */

import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'

interface LaunchTokenMeta {
    address: string
    name: string
    symbol: string
    logo: string
    description: string
    isGraduated: boolean
    marketCapNative: number | null
    priceChange1dPct: number | null
    /** Native (KUB) → USD price for the launchpad chain, mirrors the trade UI. */
    nativeUsdPrice: number | null
}

const TOKEN_META_QUERY = `
  query TokenMeta {
    launchTokens {
      items {
        tokenAddr
        name
        symbol
        logo
        description
        isGraduated
      }
    }
    tokenSnapshots {
      items {
        tokenAddr
        marketCapNative
        priceChange1dPct
      }
    }
    nativeUsdPrices(where: { chainId: ${BONDING_CURVE_JUNOSWAP_CHAIN_ID} }, limit: 1) {
      items {
        price
      }
    }
  }
`

interface TokenMetaResponse {
    data?: {
        launchTokens: {
            items: Array<{
                tokenAddr: string
                name: string
                symbol: string
                logo: string
                description: string
                isGraduated: number
            }>
        }
        tokenSnapshots: {
            items: Array<{
                tokenAddr: string
                marketCapNative: string
                priceChange1dPct: string | null
            }>
        }
        nativeUsdPrices: {
            items: Array<{ price: string }>
        }
    }
}

export async function fetchLaunchTokenMeta(address: string): Promise<LaunchTokenMeta | null> {
    const ponderUrl = process.env.PONDER_URL
    if (!ponderUrl) return null

    try {
        const response = await fetch(`${ponderUrl}/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: TOKEN_META_QUERY }),
            signal: AbortSignal.timeout(5_000),
            next: { revalidate: 60 },
        })
        if (!response.ok) return null

        const { data } = (await response.json()) as TokenMetaResponse
        if (!data) return null

        const addr = address.toLowerCase()
        const token = data.launchTokens.items.find((t) => t.tokenAddr.toLowerCase() === addr)
        if (!token) return null

        const snapshot = data.tokenSnapshots.items.find((s) => s.tokenAddr.toLowerCase() === addr)
        const marketCap = snapshot ? parseFloat(snapshot.marketCapNative) : NaN

        const rawUsd = data.nativeUsdPrices.items[0]?.price
        const nativeUsdPrice = rawUsd ? parseFloat(rawUsd) : NaN

        return {
            address,
            name: token.name ?? '',
            symbol: token.symbol ?? '',
            logo: token.logo ?? '',
            description: token.description ?? '',
            isGraduated: token.isGraduated === 1,
            marketCapNative: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null,
            priceChange1dPct: snapshot?.priceChange1dPct
                ? parseFloat(snapshot.priceChange1dPct)
                : null,
            nativeUsdPrice:
                Number.isFinite(nativeUsdPrice) && nativeUsdPrice > 0 ? nativeUsdPrice : null,
        }
    } catch {
        return null
    }
}
