import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Cache the PDV page for offline access
        urlPattern: /^\/pdv/,
        handler: "NetworkFirst",
        options: {
          cacheName: "pdv-pages",
          expiration: { maxEntries: 10, maxAgeSeconds: 86400 },
        },
      },
      {
        // Cache product images
        urlPattern: /\.(?:png|jpg|jpeg|gif|svg|webp)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 100, maxAgeSeconds: 604800 },
        },
      },
      {
        // Cache API reads (GET) with network-first
        urlPattern: /^\/api\/products/,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-products",
          expiration: { maxEntries: 50, maxAgeSeconds: 300 },
          networkTimeoutSeconds: 5,
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  // Allow images from any remote source (product images)
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default withPWA(nextConfig);
