import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/api/creative-hub/inbox/upload': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure better-sqlite3 is never bundled — it's a native C++ addon
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'better-sqlite3',
      ];
    }

    // Ignore the data/ directory so SQLite WAL writes don't trigger
    // webpack recompilation (which causes an infinite rebuild loop)
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /[\\/](data|node_modules|\.db|\.db-wal|\.db-shm)[\\/]?/,
      poll: false,
      aggregateTimeout: 300,
    };

    return config;
  },
};

export default nextConfig;
