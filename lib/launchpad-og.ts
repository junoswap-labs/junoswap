import {
    fetchLaunchTokens,
    fetchNativeUsdPrice,
    fetchTokenSnapshots,
} from '@coshi190/juno-moneta-sdk'
import { createPonderClient } from '@/lib/ponder-client'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'

interface LaunchTokenMeta {
    address: string
    name: string
    symbol: string
    logo: string
    description: string
    isGraduated: boolean
    marketCapNative: number | null
    priceChange1dPct: number | null
    nativeUsdPrice: number | null
}

export async function fetchLaunchTokenMeta(address: string): Promise<LaunchTokenMeta | null> {
    const ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL
    if (!ponderUrl) return null

    try {
        const client = createPonderClient(`${ponderUrl}/graphql`)
        const tokenAddr = address.toLowerCase()

        const [tokens, snapshots] = await Promise.all([
            fetchLaunchTokens(client, { tokenAddrs: [tokenAddr] }, [
                'tokenAddr',
                'chainId',
                'name',
                'symbol',
                'logo',
                'description',
                'isGraduated',
            ]),
            fetchTokenSnapshots(client, { tokenAddrs: [tokenAddr] }, [
                'marketCapNative',
                'priceChange1dPct',
            ]),
        ])

        const token = tokens[0]
        if (!token) return null

        const snapshot = snapshots[0]
        const nativeUsdPrice = await fetchNativeUsdPrice(client, { chainId: token.chainId })

        const meta = applyLaunchpadTokenOverride(token, token.chainId)

        const marketCap = parseFloat(snapshot?.marketCapNative ?? '')

        return {
            address,
            name: meta.name ?? '',
            symbol: meta.symbol ?? '',
            logo: resolveLaunchpadLogo(meta.logo),
            description: meta.description ?? '',
            isGraduated: meta.isGraduated === 1,
            marketCapNative: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null,
            priceChange1dPct: snapshot?.priceChange1dPct
                ? parseFloat(snapshot.priceChange1dPct)
                : null,
            nativeUsdPrice: nativeUsdPrice !== null && nativeUsdPrice > 0 ? nativeUsdPrice : null,
        }
    } catch {
        return null
    }
}
