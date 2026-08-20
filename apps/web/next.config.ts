import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    /**
     * Pin the workspace root to this app.
     *
     * Without it Next walks up looking for a lockfile and lands on one in the
     * user's home directory, which silently changes module resolution and
     * output tracing. apps/web has its own package.json and lockfile by
     * design, so it is its own root.
     */
    root: path.resolve(__dirname),
  },
}

export default nextConfig
