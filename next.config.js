/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
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
