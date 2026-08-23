import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
};

export default nextConfig;
