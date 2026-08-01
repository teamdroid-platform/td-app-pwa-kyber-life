import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'KyberLife',
        short_name: 'KyberLife',
        description: 'Gestión inteligente de gastos y vida',
        // The panel, not `/`. `/` only exists to redirect here, so starting
        // there cost every launch a whole extra round-trip —served behind the
        // OS splash, which lasts exactly as long as the app takes to paint.
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
            {
                src: '/images/logo-kyber-darkbg-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/images/logo-kyber-darkbg-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/images/logo-kyber-darkbg-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/images/logo-kyber-darkbg-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    }
}
