import type { Resource } from "@hexagonia/shared";
import * as THREE from "three";
import { TILE_COLORS } from "./boardVisuals";

export type TerrainResource = Resource | "desert";
export type TerrainTextureProfile = "board" | "landing";

interface CachedTerrainMaps {
  appearance: UltraTerrainAppearance;
  colorCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
  bumpCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
}

export interface UltraTerrainAppearance {
  topTint: string;
  insetTint: string;
  sideTint: string;
  insetSideTint: string;
  overlayBase: string;
  emissive: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  overlayOpacity: number;
  overlayScale: number;
}

export interface UltraTerrainTextureBundle {
  appearance: UltraTerrainAppearance;
  colorMap: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
  overlayMask: THREE.CanvasTexture;
}

interface TerrainTextureProfileConfig {
  size: number;
  includeRoughnessMap: boolean;
  includeBumpMap: boolean;
}

const TERRAIN_TEXTURE_SIZE = 512;
const TERRAIN_TEXTURE_PROFILE_CONFIGS: Record<TerrainTextureProfile, TerrainTextureProfileConfig> = {
  board: {
    size: 256,
    includeRoughnessMap: true,
    includeBumpMap: true
  },
  landing: {
    size: 256,
    includeRoughnessMap: false,
    includeBumpMap: false
  }
};
const SHARED_RESOURCE_FLAG = "__sharedResource";
const terrainMapCache = new Map<string, CachedTerrainMaps>();
const terrainTextureBundleCache = new Map<string, UltraTerrainTextureBundle>();

export function createUltraTerrainTextureBundle(
  resource: TerrainResource,
  profile: TerrainTextureProfile
): UltraTerrainTextureBundle {
  const cacheKey = createTerrainCacheKey(resource, profile);
  const existing = terrainTextureBundleCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const cached = getCachedTerrainMaps(resource, profile);
  const profileConfig = TERRAIN_TEXTURE_PROFILE_CONFIGS[profile];
  const bundle: UltraTerrainTextureBundle = {
    appearance: cached.appearance,
    colorMap: createCanvasTexture(cached.colorCanvas, true),
    overlayMask: createCanvasTexture(cached.overlayCanvas, false, cached.appearance.overlayScale, THREE.RepeatWrapping)
  };
  if (profileConfig.includeRoughnessMap) {
    bundle.roughnessMap = createCanvasTexture(cached.roughnessCanvas, false);
  }
  if (profileConfig.includeBumpMap) {
    bundle.bumpMap = createCanvasTexture(cached.bumpCanvas, false);
  }

  terrainTextureBundleCache.set(cacheKey, bundle);
  return bundle;
}

function createTerrainCacheKey(resource: TerrainResource, profile: TerrainTextureProfile): string {
  return `${profile}:${resource}`;
}

function getCachedTerrainMaps(resource: TerrainResource, profile: TerrainTextureProfile): CachedTerrainMaps {
  const cacheKey = createTerrainCacheKey(resource, profile);
  const existing = terrainMapCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const generated = createTerrainMaps(resource, profile);
  terrainMapCache.set(cacheKey, generated);
  return generated;
}

function createTerrainMaps(resource: TerrainResource, profile: TerrainTextureProfile): CachedTerrainMaps {
  const profileConfig = TERRAIN_TEXTURE_PROFILE_CONFIGS[profile];
  const appearance = createAppearance(resource);
  const colorCanvas = createCanvas();
  const roughnessCanvas = createCanvas();
  const bumpCanvas = createCanvas();
  const overlayCanvas = createCanvas();
  const random = createSeededRandom(resource);

  const colorContext = colorCanvas.getContext("2d")!;
  const roughnessContext = roughnessCanvas.getContext("2d")!;
  const bumpContext = bumpCanvas.getContext("2d")!;
  const overlayContext = overlayCanvas.getContext("2d")!;

  drawBaseGradients(colorContext, roughnessContext, bumpContext, resource);

  switch (resource) {
    case "lumber":
      paintLumberTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
    case "ore":
      paintOreTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
    case "grain":
      paintGrainTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
    case "brick":
      paintBrickTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
    case "wool":
      paintWoolTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
    case "desert":
      paintDesertTerrain(colorContext, roughnessContext, bumpContext, overlayContext, random);
      break;
  }

  return {
    appearance,
    colorCanvas: downsampleCanvas(colorCanvas, profileConfig.size),
    roughnessCanvas: downsampleCanvas(roughnessCanvas, profileConfig.size),
    bumpCanvas: downsampleCanvas(bumpCanvas, profileConfig.size),
    overlayCanvas: downsampleCanvas(overlayCanvas, profileConfig.size)
  };
}

function createAppearance(resource: TerrainResource): UltraTerrainAppearance {
  const base = TILE_COLORS[resource];
  const adjustedBase =
    resource === "lumber"
      ? tint(base, 0.03)
      : resource === "wool"
        ? tint(base, -0.08)
        : base;
  const topTint = adjustedBase;
  const insetTint = tint(adjustedBase, 0.05);
  const sideTint = tint(adjustedBase, -0.1);
  const insetSideTint = tint(adjustedBase, -0.05);
  const overlayBase = tint(adjustedBase, resource === "wool" ? 0.16 : 0.06);
  const emissive = tint(adjustedBase, -0.22);

  switch (resource) {
    case "lumber":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.88,
        metalness: 0.03,
        bumpScale: 0.14,
        overlayOpacity: 0.2,
        overlayScale: 1.08
      };
    case "ore":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.8,
        metalness: 0.06,
        bumpScale: 0.18,
        overlayOpacity: 0.16,
        overlayScale: 1.02
      };
    case "grain":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.72,
        metalness: 0.02,
        bumpScale: 0.14,
        overlayOpacity: 0.28,
        overlayScale: 1.18
      };
    case "brick":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.9,
        metalness: 0.01,
        bumpScale: 0.16,
        overlayOpacity: 0.18,
        overlayScale: 1.02
      };
    case "wool":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.78,
        metalness: 0.02,
        bumpScale: 0.2,
        overlayOpacity: 0.34,
        overlayScale: 1.2
      };
    case "desert":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase,
        emissive,
        roughness: 0.94,
        metalness: 0,
        bumpScale: 0.11,
        overlayOpacity: 0.16,
        overlayScale: 1.06
      };
  }
}

function paintLumberTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let index = 0; index < 18; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 54 + random() * 42, 18 + random() * 20, pick(random, [
      "rgba(25,58,28,0.18)",
      "rgba(41,78,36,0.16)",
      "rgba(65,102,48,0.12)"
    ]), rotation);
    drawEllipse(bumpContext, x, y, 50 + random() * 36, 14 + random() * 16, "rgba(208,208,208,0.08)", rotation);
    drawEllipse(roughnessContext, x, y, 46 + random() * 30, 14 + random() * 14, "rgba(186,186,186,0.06)", rotation);
  }

  for (let index = 0; index < 40; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const scale = 32 + random() * 28;
    const rotation = random() * Math.PI;
    drawForestCanopyCluster(colorContext, x, y, scale, rotation, [
      "rgba(34,83,39,0.4)",
      "rgba(54,111,55,0.38)",
      "rgba(94,151,78,0.3)"
    ]);
    drawForestCanopyCluster(bumpContext, x, y, scale * 0.96, rotation, [
      "rgba(196,196,196,0.2)",
      "rgba(156,156,156,0.18)",
      "rgba(228,228,228,0.14)"
    ]);
    drawForestCanopyCluster(roughnessContext, x, y, scale * 0.88, rotation, [
      "rgba(212,212,212,0.08)",
      "rgba(168,168,168,0.06)"
    ]);
    drawForestCanopyCluster(overlayContext, x, y, scale * 0.82, rotation, [
      "rgba(255,255,255,0.12)",
      "rgba(233,250,211,0.1)"
    ]);
  }

  for (let index = 0; index < 42; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 24 + random() * 28, 8 + random() * 12, "rgba(128,170,86,0.08)", rotation);
    drawEllipse(overlayContext, x, y, 18 + random() * 18, 6 + random() * 8, "rgba(255,255,255,0.06)", rotation);
  }

  for (let index = 0; index < 44; index += 1) {
    const startX = random() * TERRAIN_TEXTURE_SIZE;
    const startY = random() * TERRAIN_TEXTURE_SIZE;
    const endX = startX + (random() - 0.5) * 132;
    const endY = startY + (random() - 0.5) * 76;
    colorContext.strokeStyle = pick(random, ["rgba(80,58,34,0.1)", "rgba(102,77,44,0.08)"]);
    colorContext.lineWidth = 1.8 + random() * 2.2;
    colorContext.lineCap = "round";
    colorContext.beginPath();
    colorContext.moveTo(startX, startY);
    colorContext.quadraticCurveTo((startX + endX) / 2, startY + (random() - 0.5) * 30, endX, endY);
    colorContext.stroke();

    bumpContext.strokeStyle = "rgba(222,222,222,0.07)";
    bumpContext.lineWidth = 1 + random() * 1.2;
    bumpContext.beginPath();
    bumpContext.moveTo(startX, startY);
    bumpContext.quadraticCurveTo((startX + endX) / 2, startY + (random() - 0.5) * 24, endX, endY);
    bumpContext.stroke();
  }

  drawSpeckles(colorContext, random, 860, "rgba(18,42,20,0.04)", 0.6, 1.8);
  drawSpeckles(colorContext, random, 300, "rgba(220,240,179,0.04)", 0.5, 1.1);
}

function paintOreTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let index = 0; index < 18; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 46 + random() * 36, 12 + random() * 20, pick(random, [
      "rgba(72,79,90,0.16)",
      "rgba(92,100,113,0.14)",
      "rgba(116,126,140,0.12)"
    ]), rotation);
    drawEllipse(bumpContext, x, y, 38 + random() * 30, 9 + random() * 14, "rgba(210,210,210,0.1)", rotation);
    drawEllipse(roughnessContext, x, y, 34 + random() * 26, 8 + random() * 12, "rgba(176,176,176,0.07)", rotation);
  }

  for (let index = 0; index < 28; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const scale = 26 + random() * 24;
    const rotation = random() * Math.PI;
    drawOreFacetCluster(colorContext, x, y, scale, rotation, [
      "rgba(103,113,126,0.4)",
      "rgba(140,151,165,0.34)",
      "rgba(185,193,202,0.24)"
    ]);
    drawOreFacetCluster(bumpContext, x, y, scale * 0.94, rotation, [
      "rgba(112,112,112,0.18)",
      "rgba(178,178,178,0.2)",
      "rgba(228,228,228,0.14)"
    ]);
    drawOreFacetCluster(roughnessContext, x, y, scale * 0.9, rotation, [
      "rgba(162,162,162,0.08)",
      "rgba(202,202,202,0.06)"
    ]);
    if (index % 2 === 0) {
      drawOreFacetCluster(overlayContext, x, y, scale * 0.84, rotation, [
        "rgba(255,255,255,0.1)",
        "rgba(220,236,255,0.08)"
      ]);
    }
  }

  colorContext.lineCap = "round";
  bumpContext.lineCap = "round";
  overlayContext.lineCap = "round";
  for (let index = 0; index < 32; index += 1) {
    const startX = random() * TERRAIN_TEXTURE_SIZE;
    const startY = random() * TERRAIN_TEXTURE_SIZE;
    const endX = startX + (random() - 0.5) * 148;
    const endY = startY + (random() - 0.5) * 86;
    const midX = (startX + endX) / 2 + (random() - 0.5) * 24;
    const midY = (startY + endY) / 2 + (random() - 0.5) * 24;
    const veinWidth = 1.8 + random() * 2.2;

    colorContext.strokeStyle = index % 3 === 0 ? "rgba(194,223,255,0.22)" : "rgba(210,216,224,0.22)";
    colorContext.lineWidth = veinWidth;
    colorContext.beginPath();
    colorContext.moveTo(startX, startY);
    colorContext.quadraticCurveTo(midX, midY, endX, endY);
    colorContext.stroke();

    overlayContext.strokeStyle = "rgba(255,255,255,0.18)";
    overlayContext.lineWidth = Math.max(1.2, veinWidth - 0.6);
    overlayContext.beginPath();
    overlayContext.moveTo(startX, startY);
    overlayContext.quadraticCurveTo(midX, midY, endX, endY);
    overlayContext.stroke();

    bumpContext.strokeStyle = "rgba(236,236,236,0.16)";
    bumpContext.lineWidth = veinWidth * 0.65;
    bumpContext.beginPath();
    bumpContext.moveTo(startX, startY);
    bumpContext.quadraticCurveTo(midX, midY, endX, endY);
    bumpContext.stroke();
  }

  for (let index = 0; index < 26; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 28 + random() * 34, 8 + random() * 12, "rgba(60,68,78,0.11)", rotation);
    drawEllipse(overlayContext, x, y, 24 + random() * 16, 4 + random() * 6, "rgba(255,255,255,0.06)", rotation);
  }

  drawSpeckles(colorContext, random, 720, "rgba(54,60,68,0.06)", 0.8, 2.2);
}

function paintGrainTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let band = 0; band < 16; band += 1) {
    const x = band * 34 + random() * 14;
    const width = 18 + random() * 20;
    colorContext.fillStyle = pick(random, ["rgba(151,109,44,0.18)", "rgba(130,92,36,0.16)", "rgba(184,141,58,0.1)"]);
    colorContext.fillRect(x, -10, width, TERRAIN_TEXTURE_SIZE + 20);
    bumpContext.fillStyle = "rgba(186,186,186,0.08)";
    bumpContext.fillRect(x + 2, -10, Math.max(width - 4, 4), TERRAIN_TEXTURE_SIZE + 20);
  }

  const lineCount = 104;
  for (let line = 0; line < lineCount; line += 1) {
    const xOffset = (line / lineCount) * TERRAIN_TEXTURE_SIZE;
    const width = 5 + random() * 6;
    const light = 0.16 + random() * 0.16;
    colorContext.strokeStyle = `rgba(244,219,123,${light})`;
    colorContext.lineWidth = width;
    colorContext.beginPath();
    for (let y = -24; y <= TERRAIN_TEXTURE_SIZE + 24; y += 16) {
      const x = xOffset + Math.sin((y + line * 6) * 0.03) * (8 + random() * 8);
      if (y === -24) {
        colorContext.moveTo(x, y);
      } else {
        colorContext.lineTo(x, y);
      }
    }
    colorContext.stroke();

    bumpContext.strokeStyle = "rgba(210,210,210,0.16)";
    bumpContext.lineWidth = Math.max(2, width * 0.5);
    bumpContext.beginPath();
    for (let y = -24; y <= TERRAIN_TEXTURE_SIZE + 24; y += 16) {
      const x = xOffset + Math.sin((y + line * 6) * 0.03) * 6;
      if (y === -24) {
        bumpContext.moveTo(x, y);
      } else {
        bumpContext.lineTo(x, y);
      }
    }
    bumpContext.stroke();
  }

  for (let index = 0; index < 54; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawSoftBlob(overlayContext, x, y, 22 + random() * 28, "rgba(255,245,201,0.1)");
    drawSoftBlob(roughnessContext, x, y, 18 + random() * 20, "rgba(220,220,220,0.06)");
  }

  for (let track = 0; track < 18; track += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = Math.PI / 2 + (random() - 0.5) * 0.4;
    drawEllipse(colorContext, x, y, 18 + random() * 24, 4 + random() * 6, "rgba(129,93,36,0.12)", rotation);
    drawEllipse(bumpContext, x, y, 14 + random() * 16, 2 + random() * 3, "rgba(188,188,188,0.08)", rotation);
  }
}

function paintBrickTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let basin = 0; basin < 18; basin += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 32 + random() * 42, 10 + random() * 18, pick(random, [
      "rgba(122,62,46,0.2)",
      "rgba(150,79,57,0.18)",
      "rgba(179,104,74,0.14)"
    ]), rotation);
    drawEllipse(bumpContext, x, y, 28 + random() * 32, 8 + random() * 12, "rgba(198,198,198,0.08)", rotation);
    drawEllipse(roughnessContext, x, y, 26 + random() * 26, 7 + random() * 10, "rgba(92,92,92,0.08)", rotation);
  }

  for (let layer = 0; layer < 16; layer += 1) {
    const y = layer * 30 + random() * 12;
    const bandHeight = 16 + random() * 12;
    colorContext.fillStyle = pick(random, ["rgba(158,88,61,0.3)", "rgba(194,121,85,0.26)", "rgba(120,63,47,0.2)"]);
    colorContext.fillRect(-10, y, TERRAIN_TEXTURE_SIZE + 20, bandHeight);
    bumpContext.fillStyle = "rgba(175,175,175,0.07)";
    bumpContext.fillRect(-10, y, TERRAIN_TEXTURE_SIZE + 20, bandHeight * 0.7);
  }

  colorContext.strokeStyle = "rgba(83,44,29,0.34)";
  bumpContext.strokeStyle = "rgba(255,255,255,0.22)";
  roughnessContext.strokeStyle = "rgba(60,60,60,0.12)";
  for (let crack = 0; crack < 120; crack += 1) {
    const startX = random() * TERRAIN_TEXTURE_SIZE;
    const startY = random() * TERRAIN_TEXTURE_SIZE;
    colorContext.lineWidth = 1 + random() * 1.8;
    bumpContext.lineWidth = 0.8 + random() * 1.4;
    roughnessContext.lineWidth = 1.1;
    colorContext.beginPath();
    bumpContext.beginPath();
    roughnessContext.beginPath();
    colorContext.moveTo(startX, startY);
    bumpContext.moveTo(startX, startY);
    roughnessContext.moveTo(startX, startY);
    let x = startX;
    let y = startY;
    for (let segment = 0; segment < 4; segment += 1) {
      x += (random() - 0.5) * 58;
      y += (random() - 0.5) * 28;
      colorContext.lineTo(x, y);
      bumpContext.lineTo(x, y);
      roughnessContext.lineTo(x, y);
    }
    colorContext.stroke();
    bumpContext.stroke();
    roughnessContext.stroke();
  }

  for (let rut = 0; rut < 26; rut += 1) {
    const startX = random() * TERRAIN_TEXTURE_SIZE;
    const startY = random() * TERRAIN_TEXTURE_SIZE;
    const endX = startX + (random() - 0.5) * 120;
    const endY = startY + (random() - 0.5) * 54;
    bumpContext.strokeStyle = "rgba(228,228,228,0.08)";
    bumpContext.lineWidth = 1.4 + random() * 1.2;
    bumpContext.beginPath();
    bumpContext.moveTo(startX, startY);
    bumpContext.quadraticCurveTo((startX + endX) / 2, startY + (random() - 0.5) * 18, endX, endY);
    bumpContext.stroke();
  }

  for (let index = 0; index < 40; index += 1) {
    drawSoftBlob(overlayContext, random() * TERRAIN_TEXTURE_SIZE, random() * TERRAIN_TEXTURE_SIZE, 18 + random() * 24, "rgba(255,246,232,0.08)");
  }
}

function paintWoolTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let index = 0; index < 34; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = random() * Math.PI;
    drawEllipse(colorContext, x, y, 56 + random() * 44, 18 + random() * 24, pick(random, [
      "rgba(77,122,55,0.18)",
      "rgba(96,146,67,0.15)",
      "rgba(142,185,96,0.12)"
    ]), rotation);
    drawEllipse(bumpContext, x, y, 44 + random() * 30, 14 + random() * 16, "rgba(214,214,214,0.1)", rotation);
    drawEllipse(overlayContext, x, y, 40 + random() * 28, 12 + random() * 14, "rgba(246,255,232,0.08)", rotation);
  }

  for (let index = 0; index < 160; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawSoftBlob(colorContext, x, y, 14 + random() * 22, pick(random, [
      "rgba(71,112,50,0.11)",
      "rgba(101,147,70,0.1)",
      "rgba(156,192,110,0.08)"
    ]));
  }

  for (let index = 0; index < 34; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = Math.PI / 2 + (random() - 0.5) * 0.64;
    drawEllipse(colorContext, x, y, 62 + random() * 72, 2.8 + random() * 4.2, "rgba(184,214,131,0.12)", rotation);
    drawEllipse(bumpContext, x, y, 52 + random() * 60, 1.8 + random() * 2.8, "rgba(226,226,226,0.08)", rotation);
    drawEllipse(overlayContext, x, y, 56 + random() * 58, 2.1 + random() * 3.2, "rgba(250,255,242,0.08)", rotation);
  }

  for (let index = 0; index < 420; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const scale = 0.9 + random() * 1.7;
    const rotation = (random() - 0.5) * 1.1;
    drawGrassTuft(colorContext, x, y, scale, rotation, random, [
      "rgba(58,104,41,0.36)",
      "rgba(92,144,64,0.32)",
      "rgba(144,188,100,0.26)"
    ]);
    drawGrassTuft(bumpContext, x, y, scale * 0.92, rotation, random, [
      "rgba(220,220,220,0.2)",
      "rgba(188,188,188,0.16)",
      "rgba(240,240,240,0.13)"
    ]);
    if (index % 2 === 0) {
      drawGrassTuft(overlayContext, x, y, scale * 1.08, rotation, random, [
        "rgba(250,255,242,0.14)",
        "rgba(232,246,210,0.11)"
      ]);
    }
    if (index % 3 === 0) {
      drawGrassTuft(roughnessContext, x, y, scale, rotation, random, [
        "rgba(228,228,228,0.08)",
        "rgba(196,196,196,0.06)"
      ]);
    }
  }

  for (let index = 0; index < 320; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const rotation = Math.PI / 2 + (random() - 0.5) * 0.6;
    drawEllipse(colorContext, x, y, 5 + random() * 12, 0.9 + random() * 1.5, "rgba(186,214,132,0.13)", rotation);
    drawEllipse(bumpContext, x, y, 3.6 + random() * 5.8, 0.6 + random() * 0.9, "rgba(224,224,224,0.11)", rotation);
  }

  drawSpeckles(colorContext, random, 2200, "rgba(25,54,16,0.05)", 0.7, 1.6);
  drawSpeckles(colorContext, random, 900, "rgba(220,235,186,0.08)", 0.5, 1.2);
}

function paintDesertTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let dune = 0; dune < 28; dune += 1) {
    const baseY = dune * 20 + random() * 12;
    colorContext.strokeStyle = pick(random, ["rgba(248,218,154,0.22)", "rgba(226,186,120,0.16)", "rgba(255,242,212,0.16)"]);
    bumpContext.strokeStyle = "rgba(198,198,198,0.1)";
    roughnessContext.strokeStyle = "rgba(230,230,230,0.05)";
    colorContext.lineWidth = 7 + random() * 10;
    bumpContext.lineWidth = 4 + random() * 4;
    roughnessContext.lineWidth = 3;
    colorContext.beginPath();
    bumpContext.beginPath();
    roughnessContext.beginPath();
    for (let x = -20; x <= TERRAIN_TEXTURE_SIZE + 20; x += 14) {
      const y = baseY + Math.sin((x + dune * 20) * 0.026) * (12 + random() * 8);
      if (x === -20) {
        colorContext.moveTo(x, y);
        bumpContext.moveTo(x, y);
        roughnessContext.moveTo(x, y);
      } else {
        colorContext.lineTo(x, y);
        bumpContext.lineTo(x, y);
        roughnessContext.lineTo(x, y);
      }
    }
    colorContext.stroke();
    bumpContext.stroke();
    roughnessContext.stroke();
  }

  for (let ripple = 0; ripple < 360; ripple += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawEllipse(bumpContext, x, y, 8 + random() * 14, 1.2 + random() * 2.4, "rgba(220,220,220,0.08)", random() * Math.PI);
    drawEllipse(overlayContext, x, y, 12 + random() * 18, 2 + random() * 3, "rgba(255,250,238,0.07)", random() * Math.PI);
  }

  drawSpeckles(colorContext, random, 2300, "rgba(143,108,62,0.045)", 0.8, 2.2);
}

function drawBaseGradients(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  resource: TerrainResource
): void {
  const base =
    resource === "lumber"
      ? tint(TILE_COLORS[resource], 0.03)
      : resource === "wool"
        ? tint(TILE_COLORS[resource], -0.08)
      : resource === "desert"
        ? tint(TILE_COLORS[resource], 0.08)
        : TILE_COLORS[resource];
  const colorGradient = colorContext.createLinearGradient(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  colorGradient.addColorStop(0, tint(base, resource === "desert" ? 0.1 : resource === "wool" ? 0.16 : 0.08));
  colorGradient.addColorStop(0.52, base);
  colorGradient.addColorStop(1, tint(base, resource === "desert" ? -0.03 : resource === "wool" ? -0.12 : -0.06));
  colorContext.fillStyle = colorGradient;
  colorContext.fillRect(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);

  const roughnessGradient = roughnessContext.createLinearGradient(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  roughnessGradient.addColorStop(0, "rgb(214, 214, 214)");
  roughnessGradient.addColorStop(1, "rgb(162, 162, 162)");
  roughnessContext.fillStyle = roughnessGradient;
  roughnessContext.fillRect(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);

  const bumpGradient = bumpContext.createRadialGradient(
    TERRAIN_TEXTURE_SIZE * 0.35,
    TERRAIN_TEXTURE_SIZE * 0.3,
    TERRAIN_TEXTURE_SIZE * 0.1,
    TERRAIN_TEXTURE_SIZE * 0.5,
    TERRAIN_TEXTURE_SIZE * 0.5,
    TERRAIN_TEXTURE_SIZE * 0.7
  );
  bumpGradient.addColorStop(0, "rgb(146, 146, 146)");
  bumpGradient.addColorStop(1, "rgb(104, 104, 104)");
  bumpContext.fillStyle = bumpGradient;
  bumpContext.fillRect(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
}

function createCanvasTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
  repeat = 1,
  wrapMode: THREE.Wrapping = THREE.ClampToEdgeWrapping
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.userData[SHARED_RESOURCE_FLAG] = true;
  texture.wrapS = wrapMode;
  texture.wrapT = wrapMode;
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = true;
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TERRAIN_TEXTURE_SIZE;
  canvas.height = TERRAIN_TEXTURE_SIZE;
  return canvas;
}

function downsampleCanvas(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  if (source.width === size && source.height === size) {
    return source;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, size, size);
  return canvas;
}

function createSeededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tint(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] ?? items[0]!;
}

function drawSoftBlob(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string,
  rotation = 0
): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawForestCanopyCluster(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  colors: readonly [string, string, ...string[]] | readonly [string, string]
): void {
  const canopyOffsets = [
    { x: -0.34, y: 0.08, rx: 0.36, ry: 0.28 },
    { x: -0.08, y: -0.16, rx: 0.3, ry: 0.24 },
    { x: 0.2, y: 0, rx: 0.32, ry: 0.26 },
    { x: 0.04, y: 0.22, rx: 0.28, ry: 0.2 },
    { x: 0.36, y: 0.18, rx: 0.24, ry: 0.18 }
  ] as const;

  context.save();
  context.translate(x, y);
  context.rotate(rotation);

  for (const [index, canopy] of canopyOffsets.entries()) {
    context.fillStyle = colors[index % colors.length]!;
    context.beginPath();
    context.ellipse(
      canopy.x * scale,
      canopy.y * scale,
      canopy.rx * scale,
      canopy.ry * scale,
      index * 0.14,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  context.fillStyle = colors[Math.max(colors.length - 1, 0)]!;
  context.beginPath();
  context.moveTo(-0.06 * scale, 0.1 * scale);
  context.lineTo(0.04 * scale, 0.1 * scale);
  context.lineTo(0.02 * scale, 0.34 * scale);
  context.lineTo(-0.08 * scale, 0.34 * scale);
  context.closePath();
  context.fill();

  context.restore();
}

function drawOreFacetCluster(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  colors: readonly [string, string, ...string[]] | readonly [string, string]
): void {
  const facetShapes = [
    [
      [-0.52, 0.16],
      [-0.22, -0.28],
      [0.08, -0.12],
      [-0.02, 0.34]
    ],
    [
      [-0.04, 0.3],
      [0.18, -0.18],
      [0.48, -0.02],
      [0.34, 0.38]
    ],
    [
      [0.02, -0.38],
      [0.24, -0.56],
      [0.54, -0.18],
      [0.16, -0.04]
    ]
  ] as const;

  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.lineJoin = "round";

  for (const [index, points] of facetShapes.entries()) {
    context.fillStyle = colors[index % colors.length]!;
    context.beginPath();
    context.moveTo(points[0][0] * scale, points[0][1] * scale);
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      context.lineTo(points[pointIndex][0] * scale, points[pointIndex][1] * scale);
    }
    context.closePath();
    context.fill();
  }

  context.strokeStyle = colors[colors.length - 1]!;
  context.lineWidth = Math.max(1, scale * 0.03);
  context.beginPath();
  context.moveTo(-0.28 * scale, 0.02 * scale);
  context.lineTo(0.34 * scale, -0.18 * scale);
  context.lineTo(0.18 * scale, 0.28 * scale);
  context.stroke();

  context.restore();
}

function drawGrassTuft(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  random: () => number,
  colors: readonly [string, string, ...string[]] | readonly [string, string]
): void {
  const bladeCount = 5 + Math.floor(random() * 5);
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.lineCap = "round";

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const offsetX = (random() - 0.5) * 6 * scale;
    const baseY = (random() - 0.5) * 3 * scale;
    const height = (7 + random() * 12) * scale;
    const bend = (random() - 0.5) * 6 * scale;
    context.strokeStyle = pick(random, colors);
    context.lineWidth = 0.8 + random() * 1.2 * scale;
    context.beginPath();
    context.moveTo(offsetX, baseY);
    context.quadraticCurveTo(offsetX + bend * 0.35, baseY - height * 0.48, offsetX + bend, baseY - height);
    context.stroke();
  }

  context.restore();
}

function drawSpeckles(
  context: CanvasRenderingContext2D,
  random: () => number,
  count: number,
  color: string,
  minRadius: number,
  maxRadius: number
): void {
  context.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    context.beginPath();
    context.arc(
      random() * TERRAIN_TEXTURE_SIZE,
      random() * TERRAIN_TEXTURE_SIZE,
      minRadius + random() * (maxRadius - minRadius),
      0,
      Math.PI * 2
    );
    context.fill();
  }
}
