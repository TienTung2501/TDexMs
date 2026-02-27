import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://tdexms.onrender.com",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ivory-deaf-guineafowl-894.mypinata.cloud",
        pathname: "/ipfs/**",
      },
    ],
  },
};

export default nextConfig;
