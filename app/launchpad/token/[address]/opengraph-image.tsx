import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fetchLaunchTokenMeta } from '@/lib/launchpad-og'
import { formatCompact } from '@/services/launchpad'

export const alt = 'Junoswap Launchpad token'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND_FROM = '#ff3333'
const BRAND_TO = '#FF914D'
const BG = '#0a0e14'

async function loadPlatformLogo(): Promise<string | null> {
    try {
        const svg = await readFile(join(process.cwd(), 'public', 'logo.svg'))
        return `data:image/svg+xml;base64,${svg.toString('base64')}`
    } catch {
        return null
    }
}

// Formats satori can rasterize — webp and others crash the renderer
const SATORI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml']

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
    const [token, platformLogo] = await Promise.all([
        fetchLaunchTokenMeta(address),
        loadPlatformLogo(),
    ])
    const tokenLogo = token?.logo ? await loadTokenLogo(token.logo) : null

    const symbol = token?.symbol || 'TOKEN'
    const name = token?.name || 'Junoswap Launchpad'
    const change = token?.priceChange1dPct ?? null

    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                backgroundColor: BG,
                backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
                fontFamily: 'sans-serif',
            }}
        >
            {/* Brand glow accents */}
            <div
                style={{
                    position: 'absolute',
                    top: -200,
                    left: -120,
                    width: 600,
                    height: 600,
                    borderRadius: 9999,
                    backgroundImage: `radial-gradient(circle, ${BRAND_FROM}26 0%, transparent 65%)`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: -240,
                    right: -100,
                    width: 640,
                    height: 640,
                    borderRadius: 9999,
                    backgroundImage: `radial-gradient(circle, ${BRAND_TO}22 0%, transparent 65%)`,
                }}
            />

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    width: '100%',
                    height: '100%',
                    padding: '56px 72px',
                }}
            >
                {/* Header — platform identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            backgroundImage: `linear-gradient(135deg, ${BRAND_FROM}, ${BRAND_TO})`,
                        }}
                    >
                        {platformLogo ? (
                            <img src={platformLogo} alt="" width={40} height={40} />
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    color: 'white',
                                    fontSize: 30,
                                    fontWeight: 800,
                                }}
                            >
                                J
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', color: 'white', fontSize: 36, fontWeight: 800 }}>
                        Junoswap
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            color: 'rgba(255,255,255,0.55)',
                            fontSize: 20,
                            fontWeight: 700,
                            letterSpacing: 4,
                            border: '1px solid rgba(255,255,255,0.18)',
                            borderRadius: 999,
                            padding: '6px 18px',
                        }}
                    >
                        LAUNCHPAD
                    </div>
                </div>

                {/* Body — token identity left, image right */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 48,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
                        <div
                            style={{
                                display: 'flex',
                                color: 'white',
                                fontSize: 104,
                                fontWeight: 800,
                                lineHeight: 1.05,
                            }}
                        >
                            {symbol.slice(0, 12)}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                color: 'rgba(255,255,255,0.6)',
                                fontSize: 38,
                                marginTop: 8,
                            }}
                        >
                            {name.slice(0, 36)}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                marginTop: 28,
                            }}
                        >
                            {token?.marketCapNative != null && (
                                <div
                                    style={{
                                        display: 'flex',
                                        color: 'white',
                                        fontSize: 32,
                                        fontWeight: 700,
                                    }}
                                >
                                    {`MC ${formatCompact(token.marketCapNative)} KUB`}
                                </div>
                            )}
                            {change != null && (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 24,
                                        fontWeight: 700,
                                        color: change >= 0 ? '#34d399' : '#f87171',
                                        backgroundColor:
                                            change >= 0
                                                ? 'rgba(52,211,153,0.15)'
                                                : 'rgba(248,113,113,0.15)',
                                        borderRadius: 10,
                                        padding: '6px 14px',
                                    }}
                                >
                                    {`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
                                </div>
                            )}
                            {token?.isGraduated && (
                                <div
                                    style={{
                                        display: 'flex',
                                        fontSize: 24,
                                        fontWeight: 700,
                                        color: '#34d399',
                                        backgroundColor: 'rgba(52,211,153,0.15)',
                                        borderRadius: 10,
                                        padding: '6px 14px',
                                    }}
                                >
                                    Graduated
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Token image */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 300,
                            height: 300,
                            borderRadius: 36,
                            border: '1px solid rgba(255,255,255,0.14)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        {tokenLogo ? (
                            <img
                                src={tokenLogo}
                                alt=""
                                width={300}
                                height={300}
                                style={{ objectFit: 'cover' }}
                            />
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    color: 'rgba(255,255,255,0.45)',
                                    fontSize: 96,
                                    fontWeight: 800,
                                }}
                            >
                                {symbol
                                    .replace(/[^a-zA-Z0-9]/g, '')
                                    .slice(0, 2)
                                    .toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — CTA */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            color: 'white',
                            fontSize: 26,
                            fontWeight: 800,
                            letterSpacing: 2,
                            backgroundImage: `linear-gradient(135deg, ${BRAND_FROM}, ${BRAND_TO})`,
                            borderRadius: 999,
                            padding: '14px 36px',
                        }}
                    >
                        {`BUY ${symbol.slice(0, 12)} →`}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: 24,
                        }}
                    >
                        junoswap.trade
                    </div>
                </div>
            </div>
        </div>,
        size
    )
}
