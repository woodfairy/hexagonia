import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { browserTheme } from "./scripts/browserTheme.mjs";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const manifestTemplatePath = fileURLToPath(new URL("./public/favicon/site.webmanifest", import.meta.url));
const browserConfigTemplatePath = fileURLToPath(new URL("./public/favicon/browserconfig.xml", import.meta.url));

function transformBrowserThemeHtml(html: string): string {
  return html
    .replace(
      /<meta name="theme-color" content="[^"]+" \/>/,
      `<meta name="theme-color" content="${browserTheme.color}" />`
    )
    .replace(
      /<meta name="msapplication-TileColor" content="[^"]+" \/>/,
      `<meta name="msapplication-TileColor" content="${browserTheme.color}" />`
    );
}

function buildManifest(): string {
  const current = JSON.parse(readFileSync(manifestTemplatePath, "utf8")) as Record<string, unknown>;
  return `${JSON.stringify(
    {
      ...current,
      theme_color: browserTheme.color,
      background_color: browserTheme.color
    },
    null,
    2
  )}\n`;
}

function buildBrowserConfig(): string {
  return readFileSync(browserConfigTemplatePath, "utf8").replace(
    /<TileColor>[^<]+<\/TileColor>/,
    `<TileColor>${browserTheme.color}</TileColor>`
  );
}

function browserThemePlugin(): Plugin {
  const manifest = buildManifest();
  const browserConfig = buildBrowserConfig();

  return {
    name: "hexagonia-browser-theme",
    transformIndexHtml(html) {
      return transformBrowserThemeHtml(html);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = req.url?.split("?")[0];
        if (requestPath === "/favicon/site.webmanifest") {
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          res.end(manifest);
          return;
        }

        if (requestPath === "/favicon/browserconfig.xml") {
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(browserConfig);
          return;
        }

        next();
      });
    },
    async writeBundle(outputOptions) {
      const outputDir =
        outputOptions.dir && path.isAbsolute(outputOptions.dir)
          ? outputOptions.dir
          : path.resolve(webRoot, outputOptions.dir ?? "dist");
      const faviconDir = path.join(outputDir, "favicon");
      await mkdir(faviconDir, { recursive: true });
      await Promise.all([
        writeFile(path.join(faviconDir, "site.webmanifest"), manifest, "utf8"),
        writeFile(path.join(faviconDir, "browserconfig.xml"), browserConfig, "utf8")
      ]);
    }
  };
}

export default defineConfig({
  plugins: [react(), browserThemePlugin()],
  resolve: {
    alias: {
      "@hexagonia/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4173
  }
});
