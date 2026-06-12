import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fetchLaunchTokenMeta } from '@/lib/launchpad-og'
import { formatCompact } from '@/services/launchpad'

export const alt = 'Junoswap Launchpad token'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Mirror the share-modal card (components/launchpad/share-token-dialog.tsx).
const BRAND_FROM = '#ff3333' // primary (hsl(0 100% 60%))
const BRAND_TO = '#FF914D'
const CARD_BG = '#0a0e14'
const EMERALD_BG = 'rgba(16,185,129,0.15)'
const EMERALD_TEXT = '#34d399'
const RED_BG = 'rgba(239,68,68,0.15)'
const RED_TEXT = '#f87171'

// Formats satori can rasterize — webp and others crash the renderer.
const SATORI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml']

/**
 * The modal renders its logo glyph with a CSS gradient `mask-image`, which satori
 * doesn't support. Instead we recolor logo.svg's white fills to the brand gradient
 * directly (resvg renders SVG gradients), giving the same gradient glyph.
 */
async function loadBrandLogo(): Promise<string | null> {
    try {
        let svg = (await readFile(join(process.cwd(), 'public', 'logo.svg'))).toString('utf8')
        const grad = `<linearGradient id="brandGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="750" y2="750"><stop offset="0" stop-color="${BRAND_FROM}"/><stop offset="1" stop-color="${BRAND_TO}"/></linearGradient>`
        svg = svg
            .replace('<defs>', `<defs>${grad}`)
            .replaceAll('fill="#ffffff"', 'fill="url(#brandGrad)"')
        return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    } catch {
        return null
    }
}

async function loadTokenLogo(url: string): Promise<string | null> {
    if (!url || !url.startsWith('http')) return null
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(8_000),
            next: { revalidate: 3600 },
        })
        if (!response.ok) return null
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
        if (!SATORI_IMAGE_TYPES.includes(contentType)) return null
        const buffer = Buffer.from(await response.arrayBuffer())
        return `data:${contentType};base64,${buffer.toString('base64')}`
    } catch {
        return null
    }
}

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
    const { address } = await params
    const [token, brandLogo] = await Promise.all([fetchLaunchTokenMeta(address), loadBrandLogo()])
    const tokenLogo = token?.logo ? await loadTokenLogo(token.logo) : null

    const symbol = token?.symbol || 'TOKEN'
    const name = token?.name || 'Junoswap Launchpad'
    const change = token?.priceChange1dPct ?? null

    // Same MC rule as the modal: USD when a native price exists, else KUB.
    const mcDisplay =
        token?.marketCapNative != null
            ? token.nativeUsdPrice != null
                ? `$${formatCompact(token.marketCapNative * token.nativeUsdPrice)}`
                : `${formatCompact(token.marketCapNative)} KUB`
            : null

    const initials =
        symbol
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 2)
            .toUpperCase() || '?'

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                backgroundColor: CARD_BG,
            }}
        >
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    backgroundColor: CARD_BG,
                    // Grid overlay — modal uses 24px on a ~400px card; scaled to keep density.
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
                    backgroundSize: '60px 60px',
                }}
            >
                {/* Brand glows (modal blur-3xl → radial gradient, satori has no blur) */}
                <div
                    style={{
                        position: 'absolute',
                        top: -160,
                        left: -120,
                        width: 620,
                        height: 620,
                        borderRadius: 9999,
                        backgroundImage:
                            'radial-gradient(circle, rgba(255,51,51,0.22) 0%, transparent 65%)',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        bottom: -200,
                        right: -100,
                        width: 660,
                        height: 660,
                        borderRadius: 9999,
                        backgroundImage:
                            'radial-gradient(circle, rgba(255,145,77,0.16) 0%, transparent 65%)',
                    }}
                />

                {/* Card content */}
                <div
                    style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        height: '100%',
                        padding: 72,
                        gap: 48,
                    }}
                >
                    {/* Left column */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        {/* Logo + wordmark */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {brandLogo ? (
                                <img src={brandLogo} width={40} height={40} alt="" />
                            ) : null}
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: 36,
                                    fontWeight: 800,
                                    backgroundImage: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_TO})`,
                                    backgroundClip: 'text',
                                    WebkitBackgroundClip: 'text',
                                    color: 'transparent',
                                }}
                            >
                                Junoswap
                            </div>
                        </div>

                        {/* Symbol */}
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 28,
                                fontSize: 104,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: -2,
                                lineHeight: 1,
                                color: 'white',
                            }}
                        >
                            {symbol.slice(0, 14)}
                        </div>

                        {/* Name */}
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 12,
                                fontSize: 40,
                                color: 'rgba(255,255,255,0.55)',
                            }}
                        >
                            {name.slice(0, 38)}
                        </div>

                        {/* Badge row */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                marginTop: 28,
                            }}
                        >
                            {mcDisplay && (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 40,
                                        fontWeight: 600,
                                        color: 'white',
                                    }}
                                >
                                    {`MC ${mcDisplay}`}
                                </div>
                            )}
                            {change != null && (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 28,
                                        fontWeight: 600,
                                        padding: '6px 14px',
                                        borderRadius: 10,
                                        color: change >= 0 ? EMERALD_TEXT : RED_TEXT,
                                        backgroundColor: change >= 0 ? EMERALD_BG : RED_BG,
                                    }}
                                >
                                    {`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
                                </div>
                            )}
                            {token?.isGraduated && (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 28,
                                        fontWeight: 600,
                                        padding: '6px 14px',
                                        borderRadius: 10,
                                        color: EMERALD_TEXT,
                                        backgroundColor: EMERALD_BG,
                                    }}
                                >
                                    Graduated
                                </div>
                            )}
                        </div>

                        {/* BUY pill */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginTop: 40,
                                alignSelf: 'flex-start',
                                padding: '16px 36px',
                                borderRadius: 9999,
                                fontSize: 32,
                                fontWeight: 700,
                                letterSpacing: 2,
                                color: 'white',
                                backgroundImage: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_TO})`,
                            }}
                        >
                            BUY
                            <svg
                                width={26}
                                height={26}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M5 12h14" />
                                <path d="M12 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>

                    {/* Right — token image in bordered box */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 16,
                            borderRadius: 36,
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            flexShrink: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 300,
                                height: 300,
                                borderRadius: 24,
                                overflow: 'hidden',
                                backgroundColor: 'rgba(255,255,255,0.04)',
                            }}
                        >
                            {tokenLogo ? (
                                <img
                                    src={tokenLogo}
                                    width={300}
                                    height={300}
                                    style={{ objectFit: 'cover' }}
                                    alt=""
                                />
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 120,
                                        fontWeight: 800,
                                        color: 'rgba(255,255,255,0.45)',
                                    }}
                                >
                                    {initials}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        size
    )
}
