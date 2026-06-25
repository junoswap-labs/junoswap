import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const alt = 'Junoswap — Web3 Aggregation Platform'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Hero "Warp Vector" palette (components/landing/hero.tsx + hero-background.tsx).
const BRAND_FROM = '#ff3333' // primary, hsl(0 100% 60%)
const BRAND_TO = '#FF914D'
const VOID_BG = '#04050B' // hero canvas background

/**
 * logo.svg is a flat white glyph. Satori can't do the site's CSS `mask-image`
 * gradient, so we inject a real SVG <linearGradient> and repaint the white fills
 * with it (resvg renders SVG gradients) — same trick as the launchpad token OG.
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

// Satori accepts ttf/otf/woff (not woff2). @fontsource ships latin .woff files.
async function loadInter(weight: 400 | 800): Promise<ArrayBuffer | null> {
    try {
        const res = await fetch(
            `https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
            { signal: AbortSignal.timeout(8_000), next: { revalidate: 86_400 } }
        )
        if (!res.ok) return null
        return await res.arrayBuffer()
    } catch {
        return null
    }
}

export default async function Image() {
    const [brandLogo, interRegular, interBold] = await Promise.all([
        loadBrandLogo(),
        loadInter(400),
        loadInter(800),
    ])

    const fonts = [
        interRegular && {
            name: 'Inter',
            data: interRegular,
            weight: 400 as const,
            style: 'normal' as const,
        },
        interBold && {
            name: 'Inter',
            data: interBold,
            weight: 800 as const,
            style: 'normal' as const,
        },
    ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 800; style: 'normal' }[]

    const fontFamily = fonts.length ? 'Inter' : undefined

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: VOID_BG,
                fontFamily,
                overflow: 'hidden',
                // Faint grid, matching the token OG density.
                backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
            }}
        >
            {/* Warm focal glow (no blur in satori → stacked radial gradients). */}
            <div
                style={{
                    position: 'absolute',
                    top: -120,
                    left: 300,
                    width: 600,
                    height: 600,
                    backgroundImage:
                        'radial-gradient(circle, rgba(255,145,77,0.20) 0%, transparent 60%)',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 420,
                    width: 360,
                    height: 360,
                    backgroundImage:
                        'radial-gradient(circle, rgba(255,215,0,0.16) 0%, transparent 60%)',
                }}
            />

            {/* Top hairline accent */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 360,
                    width: 480,
                    height: 2,
                    backgroundImage: `linear-gradient(90deg, transparent, ${BRAND_FROM}, ${BRAND_TO}, transparent)`,
                }}
            />

            {/* Centered brandmark column */}
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                }}
            >
                {brandLogo ? <img src={brandLogo} width={196} height={196} alt="" /> : null}

                <div
                    style={{
                        display: 'flex',
                        marginTop: 28,
                        fontSize: 78,
                        fontWeight: 800,
                        letterSpacing: -2,
                        lineHeight: 1,
                        backgroundImage: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_TO})`,
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                    }}
                >
                    Junoswap
                </div>

                <div
                    style={{
                        display: 'flex',
                        marginTop: 22,
                        fontSize: 34,
                        fontWeight: 400,
                        letterSpacing: 0.5,
                        color: 'rgba(255,255,255,0.62)',
                    }}
                >
                    Best rates. Any chain. One platform.
                </div>
            </div>

            {/* Domain */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 44,
                    right: 56,
                    display: 'flex',
                    fontSize: 26,
                    fontWeight: 400,
                    letterSpacing: 1,
                    color: 'rgba(255,255,255,0.40)',
                }}
            >
                junoswap.trade
            </div>
        </div>,
        { ...size, fonts }
    )
}
