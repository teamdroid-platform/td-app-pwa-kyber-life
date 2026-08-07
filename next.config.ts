import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    cacheOnFrontEndNav: true,
    fallbacks: {
        document: "/offline.html",
    },
    workboxOptions: {
        skipWaiting: true,
        clientsClaim: true,
    },
});

const nextConfig: NextConfig = {
    output: "standalone",
    turbopack: {},
    experimental: {
        // Voice capture posts the recording to a Server Action. The 1 MB default
        // rejects anything past roughly a minute of Opus, and it fails as an
        // opaque request error rather than as something the UI can explain.
        serverActions: {
            bodySizeLimit: "10mb",
        },
    },
};

export default withPWA(nextConfig);
