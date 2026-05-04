// Bundles the React content script; a small post plugin bundles the MV3 service worker.
import { defineConfig, loadEnv, build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Chrome Web Store builds: no localhost host permissions; no baked-in LLM proxy URL. */
function isChromeWebStoreBuild(mode: string): boolean {
  return mode === "store";
}

function serviceWorkerBuildPlugin(
  env: Record<string, string>,
  storeBuild: boolean,
): Plugin {
  const llmProxyUrl = storeBuild ? "" : (env.VITE_RMIA_LLM_PROXY_URL ?? "");
  return {
    name: "rmia-service-worker-bundle",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      await build({
        configFile: false,
        root,
        publicDir: false,
        build: {
          emptyOutDir: false,
          outDir: "dist",
          rollupOptions: {
            input: resolve(root, "src/background/service-worker.ts"),
            output: {
              format: "iife",
              entryFileNames: "assets/background.js",
              name: "RMIABackground",
              inlineDynamicImports: true,
            },
          },
        },
        define: {
          __RMIA_LLM_PROXY_URL__: JSON.stringify(llmProxyUrl),
        },
      });
    },
  };
}

/** After `vite build --mode store`, strip localhost from dist/manifest.json for reviewers. */
function chromeWebStoreManifestPlugin(storeBuild: boolean): Plugin {
  return {
    name: "chrome-web-store-manifest",
    apply: "build",
    enforce: "post",
    closeBundle() {
      if (!storeBuild) return;
      const manifestPath = resolve(root, "dist", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        host_permissions?: string[];
      };
      if (Array.isArray(manifest.host_permissions)) {
        manifest.host_permissions = manifest.host_permissions.filter(
          (h) => !/^https?:\/\/(127\.0\.0\.1|localhost)\//i.test(h),
        );
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const storeBuild = isChromeWebStoreBuild(mode);
  return {
    plugins: [
      react(),
      serviceWorkerBuildPlugin(env, storeBuild),
      chromeWebStoreManifestPlugin(storeBuild),
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: resolve(root, "src/content/main.tsx"),
        output: {
          format: "iife",
          name: "RightmoveCompanion",
          entryFileNames: "assets/content.js",
          assetFileNames: "assets/[name][extname]",
          inlineDynamicImports: true,
        },
      },
    },
  };
});
