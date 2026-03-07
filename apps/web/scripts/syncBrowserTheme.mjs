import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserTheme } from "./browserTheme.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const themeColor = browserTheme.color;

const indexHtmlPath = path.join(webRoot, "index.html");
const manifestPath = path.join(webRoot, "public", "favicon", "site.webmanifest");
const browserConfigPath = path.join(webRoot, "public", "favicon", "browserconfig.xml");

async function syncIndexHtml() {
  const current = await readFile(indexHtmlPath, "utf8");
  const next = current
    .replace(
      /<meta name="theme-color" content="[^"]+" \/>/,
      `<meta name="theme-color" content="${themeColor}" />`
    )
    .replace(
      /<meta name="msapplication-TileColor" content="[^"]+" \/>/,
      `<meta name="msapplication-TileColor" content="${themeColor}" />`
    );

  if (next !== current) {
    await writeFile(indexHtmlPath, next, "utf8");
  }
}

async function syncManifest() {
  const current = JSON.parse(await readFile(manifestPath, "utf8"));
  const next = {
    ...current,
    theme_color: themeColor,
    background_color: themeColor
  };

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const existing = await readFile(manifestPath, "utf8");
  if (serialized !== existing) {
    await writeFile(manifestPath, serialized, "utf8");
  }
}

async function syncBrowserConfig() {
  const current = await readFile(browserConfigPath, "utf8");
  const next = current.replace(/<TileColor>[^<]+<\/TileColor>/, `<TileColor>${themeColor}</TileColor>`);

  if (next !== current) {
    await writeFile(browserConfigPath, next, "utf8");
  }
}

await Promise.all([syncIndexHtml(), syncManifest(), syncBrowserConfig()]);
