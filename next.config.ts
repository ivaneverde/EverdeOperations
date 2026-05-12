import type { NextConfig } from "next";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(rootDir);

class NormalizeProjectPathCasingPlugin {
  apply(compiler: {
    hooks: {
      normalModuleFactory: {
        tap: (
          name: string,
          fn: (nmf: {
            hooks: {
              afterResolve: {
                tap: (
                  name: string,
                  fn: (data: { createData?: Record<string, unknown> }) => void,
                ) => void;
              };
            };
          }) => void,
        ) => void;
      };
    };
  }) {
    compiler.hooks.normalModuleFactory.tap(
      "NormalizeProjectPathCasingPlugin",
      (nmf) => {
        nmf.hooks.afterResolve.tap(
          "NormalizeProjectPathCasingPlugin",
          (data) => {
            const d = data.createData;
            if (!d) return;
            for (const key of [
              "resource",
              "userRequest",
              "request",
            ] as const) {
              const v = d[key];
              if (typeof v === "string" && v.includes("Everde-AI-Operations")) {
                d[key] = v.replace(/Everde-AI-Operations/g, "everde-ai-operations");
              }
            }
          },
        );
      },
    );
  }
}

const nextConfig: NextConfig = {
  eslint: {
    dirs: ["src"],
  },
  async redirects() {
    return [
      {
        source: "/communication/teams",
        destination: "/communication",
        permanent: true,
      },
    ];
  },
  webpack: (config) => {
    config.plugins.push(new NormalizeProjectPathCasingPlugin());
    return config;
  },
};

export default nextConfig;
