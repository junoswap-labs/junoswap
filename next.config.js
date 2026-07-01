/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'cmswap.mypinata.cloud' },
            { protocol: 'https', hostname: 'gateway.pinata.cloud' },
        ],
        // logos are immutable per CID — cache aggressively
        minimumCacheTTL: 2592000,
        // uploaded logos may be SVG (see ALLOWED_MIME_TYPES in upload-to-pinata.ts)
        dangerouslyAllowSVG: true,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
    webpack: (config) => {
        config.resolve.fallback = { fs: false, net: false, tls: false }
        config.externals.push('pino-pretty', 'lokijs', 'encoding')
        config.module.rules.push({
            test: /\.(frag|vert|glsl)$/,
            type: 'asset/source',
        })
        return config
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
}

export default nextConfig
