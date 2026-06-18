// Display metadata for the liquidity sources shown in the Portfolio activity feed.
// Keyed by the same dexIds the indexer writes to swap rows (see lib/dex-config
// DEX_CONFIGS_REGISTRY and indexer/external-pools.json).

interface ProtocolMeta {
    label: string
    logo?: string
}

const PROTOCOLS: Record<string, ProtocolMeta> = {
    junoswap: { label: 'Junoswap', logo: 'https://icons.llamao.fi/icons/protocols/junoswap.trade' },
    kublerx: { label: 'Kublerx', logo: 'https://icons.llamao.fi/icons/protocols/kublerx' },
    jibswap: { label: 'Jibswap', logo: 'https://icons.llamao.fi/icons/protocols/jibswap' },
    udonswap: { label: 'Udonswap', logo: 'https://icons.llamao.fi/icons/protocols/udonswap' },
    ponder: { label: 'Ponder', logo: 'https://icons.llamao.fi/icons/protocols/ponder-finance' },
    diamon: { label: 'Diamon', logo: '/dex/diamon.png' },
}

// Resolve a dexId to its display label + logo. Unknown/empty ids fall back to a
// title-cased label with no logo, so the badge still renders a monogram.
export function getProtocolMeta(id?: string | null): ProtocolMeta {
    if (!id) return { label: 'Unknown' }
    const known = PROTOCOLS[id]
    if (known) return known
    return { label: id.charAt(0).toUpperCase() + id.slice(1) }
}
