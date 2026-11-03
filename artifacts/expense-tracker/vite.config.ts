import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");
  const rawPort = env.VITE_PORT || "5173";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid VITE_PORT value: "${rawPort}"`);
  }

  const basePath = env.BASE_PATH || "/";

  if (!basePath.startsWith("/") || !basePath.endsWith("/")) {
    throw new Error("BASE_PATH must start and end with a slash (for example, /).");
  }
  const apiPort = Number(env.API_PORT || env.PORT || "4173");
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error(`Invalid API_PORT value: "${env.API_PORT}"`);
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss({ optimize: false }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
      allowedHosts: true,
      fs: { strict: true },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
