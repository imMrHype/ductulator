import type { NextConfig } from "next";

// Use require so TypeScript doesn't need type declarations for next-pwa
// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWAInit: any = require("next-pwa");

const withPWA = withPWAInit({
  dest: "public",
  disable: disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
