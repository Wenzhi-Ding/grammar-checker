import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the Next.js dev overlay indicators (the rotating build-activity ring, etc.).
  devIndicators: false,
  // Root path "/" → "/en" permanent redirect. /en and /zh are the two canonical
  // locale URLs (hreflang-driven); the bare root serves no content to avoid
  // splitting link equity between "/" and "/en".
  async redirects() {
    return [
      {
        source: "/",
        destination: "/en",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
