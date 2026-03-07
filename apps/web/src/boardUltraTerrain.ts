import type { Resource } from "@hexagonia/shared";
import * as THREE from "three";
import { TILE_COLORS } from "./boardVisuals";

export type TerrainResource = Resource | "desert";

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
  overlayAccent: string;
  emissive: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  clearcoat: number;
  clearcoatRoughness: number;
  overlayOpacity: number;
  overlayMotion: number;
  overlayScale: number;
  styleIndex: number;
}

export interface UltraTerrainTextureBundle {
  appearance: UltraTerrainAppearance;
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  overlayMask: THREE.CanvasTexture;
}

const TERRAIN_TEXTURE_SIZE = 512;
const terrainMapCache = new Map<TerrainResource, CachedTerrainMaps>();

export function createUltraTerrainTextureBundle(resource: TerrainResource): UltraTerrainTextureBundle {
  const cached = getCachedTerrainMaps(resource);
  return {
    appearance: cached.appearance,
    colorMap: createCanvasTexture(cached.colorCanvas, true),
    roughnessMap: createCanvasTexture(cached.roughnessCanvas, false),
    bumpMap: createCanvasTexture(cached.bumpCanvas, false),
    overlayMask: createCanvasTexture(cached.overlayCanvas, false, cached.appearance.overlayScale)
  };
}

function getCachedTerrainMaps(resource: TerrainResource): CachedTerrainMaps {
  const existing = terrainMapCache.get(resource);
  if (existing) {
    return existing;
  }

  const generated = createTerrainMaps(resource);
  terrainMapCache.set(resource, generated);
  return generated;
}

function createTerrainMaps(resource: TerrainResource): CachedTerrainMaps {
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
    colorCanvas,
    roughnessCanvas,
    bumpCanvas,
    overlayCanvas
  };
}

function createAppearance(resource: TerrainResource): UltraTerrainAppearance {
  const base = TILE_COLORS[resource];
  const topTint = tint(base, 0.08);
  const insetTint = tint(base, 0.16);
  const sideTint = tint(base, -0.22);
  const insetSideTint = tint(base, -0.12);

  switch (resource) {
    case "lumber":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#8fd67c",
        overlayAccent: "#eef9c9",
        emissive: "#0f3a1c",
        roughness: 0.86,
        metalness: 0.03,
        bumpScale: 0.18,
        clearcoat: 0.08,
        clearcoatRoughness: 0.6,
        overlayOpacity: 0.26,
        overlayMotion: 0.92,
        overlayScale: 1.12,
        styleIndex: 0
      };
    case "ore":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#9fd0ff",
        overlayAccent: "#f6d7a8",
        emissive: "#203348",
        roughness: 0.74,
        metalness: 0.08,
        bumpScale: 0.22,
        clearcoat: 0.04,
        clearcoatRoughness: 0.78,
        overlayOpacity: 0.2,
        overlayMotion: 0.48,
        overlayScale: 1.04,
        styleIndex: 1
      };
    case "grain":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#f3d36f",
        overlayAccent: "#fff0b5",
        emissive: "#5a4413",
        roughness: 0.72,
        metalness: 0.02,
        bumpScale: 0.14,
        clearcoat: 0.12,
        clearcoatRoughness: 0.42,
        overlayOpacity: 0.28,
        overlayMotion: 1.18,
        overlayScale: 1.18,
        styleIndex: 2
      };
    case "brick":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#e5a87d",
        overlayAccent: "#f7d8b8",
        emissive: "#4b2617",
        roughness: 0.9,
        metalness: 0.01,
        bumpScale: 0.16,
        clearcoat: 0.02,
        clearcoatRoughness: 0.9,
        overlayOpacity: 0.18,
        overlayMotion: 0.36,
        overlayScale: 1.02,
        styleIndex: 3
      };
    case "wool":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#bfe87a",
        overlayAccent: "#f2ffd5",
        emissive: "#2f5121",
        roughness: 0.82,
        metalness: 0.02,
        bumpScale: 0.12,
        clearcoat: 0.08,
        clearcoatRoughness: 0.52,
        overlayOpacity: 0.24,
        overlayMotion: 0.86,
        overlayScale: 1.1,
        styleIndex: 4
      };
    case "desert":
      return {
        topTint,
        insetTint,
        sideTint,
        insetSideTint,
        overlayBase: "#f0d39d",
        overlayAccent: "#fff1cf",
        emissive: "#684f2d",
        roughness: 0.94,
        metalness: 0,
        bumpScale: 0.11,
        clearcoat: 0.02,
        clearcoatRoughness: 0.88,
        overlayOpacity: 0.16,
        overlayMotion: 0.68,
        overlayScale: 1.06,
        styleIndex: 5
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
  for (let index = 0; index < 240; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const radius = 16 + random() * 38;
    drawSoftBlob(colorContext, x, y, radius, pick(random, ["rgba(23,68,28,0.54)", "rgba(41,97,44,0.62)", "rgba(87,138,68,0.5)"]));
    drawSoftBlob(bumpContext, x, y, radius * 0.88, `rgba(${120 + Math.round(random() * 60)},${120 + Math.round(random() * 60)},${120 + Math.round(random() * 60)},0.34)`);
    drawSoftBlob(roughnessContext, x, y, radius * 0.92, "rgba(210,210,210,0.08)");
  }

  for (let index = 0; index < 120; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const radius = 8 + random() * 18;
    drawSoftBlob(colorContext, x, y, radius, "rgba(169,214,124,0.18)");
    drawSoftBlob(overlayContext, x, y, radius * 1.35, "rgba(255,255,255,0.14)");
  }

  drawSpeckles(colorContext, random, 2200, "rgba(8,24,12,0.06)", 0.8, 2.4);
}

function paintOreTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let band = 0; band < 9; band += 1) {
    const y = 28 + band * 56 + random() * 18;
    const height = 38 + random() * 24;
    const ridge = new Path2D();
    ridge.moveTo(-20, y + height);
    for (let x = 0; x <= TERRAIN_TEXTURE_SIZE + 20; x += 36) {
      ridge.lineTo(x, y - random() * height);
      ridge.lineTo(x + 18, y + height * (0.5 + random() * 0.7));
    }
    ridge.lineTo(TERRAIN_TEXTURE_SIZE + 20, TERRAIN_TEXTURE_SIZE + 20);
    ridge.lineTo(-20, TERRAIN_TEXTURE_SIZE + 20);
    ridge.closePath();

    colorContext.fillStyle = pick(random, ["rgba(98,110,128,0.42)", "rgba(121,132,151,0.38)", "rgba(63,76,92,0.48)"]);
    colorContext.fill(ridge);
    bumpContext.fillStyle = pick(random, ["rgba(220,220,220,0.12)", "rgba(160,160,160,0.22)", "rgba(90,90,90,0.18)"]);
    bumpContext.fill(ridge);
    roughnessContext.fillStyle = "rgba(156,156,156,0.08)";
    roughnessContext.fill(ridge);
  }

  colorContext.lineCap = "round";
  bumpContext.lineCap = "round";
  overlayContext.lineCap = "round";
  for (let index = 0; index < 24; index += 1) {
    const startX = random() * TERRAIN_TEXTURE_SIZE;
    const startY = random() * TERRAIN_TEXTURE_SIZE;
    const endX = startX + (random() - 0.5) * 180;
    const endY = startY + (random() - 0.5) * 90;
    const veinWidth = 1.6 + random() * 2.6;
    colorContext.strokeStyle = index % 2 === 0 ? "rgba(171,214,255,0.34)" : "rgba(233,185,129,0.28)";
    colorContext.lineWidth = veinWidth;
    colorContext.beginPath();
    colorContext.moveTo(startX, startY);
    colorContext.lineTo(endX, endY);
    colorContext.stroke();

    overlayContext.strokeStyle = "rgba(255,255,255,0.22)";
    overlayContext.lineWidth = Math.max(1.2, veinWidth - 0.5);
    overlayContext.beginPath();
    overlayContext.moveTo(startX, startY);
    overlayContext.lineTo(endX, endY);
    overlayContext.stroke();

    bumpContext.strokeStyle = "rgba(238,238,238,0.2)";
    bumpContext.lineWidth = veinWidth * 0.7;
    bumpContext.beginPath();
    bumpContext.moveTo(startX, startY);
    bumpContext.lineTo(endX, endY);
    bumpContext.stroke();
  }
}

function paintGrainTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  const lineCount = 84;
  for (let line = 0; line < lineCount; line += 1) {
    const xOffset = (line / lineCount) * TERRAIN_TEXTURE_SIZE;
    const width = 4 + random() * 5;
    const light = 0.18 + random() * 0.18;
    colorContext.strokeStyle = `rgba(244,219,123,${light})`;
    colorContext.lineWidth = width;
    colorContext.beginPath();
    for (let y = -24; y <= TERRAIN_TEXTURE_SIZE + 24; y += 18) {
      const x = xOffset + Math.sin((y + line * 6) * 0.03) * (10 + random() * 12);
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
    for (let y = -24; y <= TERRAIN_TEXTURE_SIZE + 24; y += 18) {
      const x = xOffset + Math.sin((y + line * 6) * 0.03) * 8;
      if (y === -24) {
        bumpContext.moveTo(x, y);
      } else {
        bumpContext.lineTo(x, y);
      }
    }
    bumpContext.stroke();
  }

  for (let index = 0; index < 40; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawSoftBlob(overlayContext, x, y, 26 + random() * 34, "rgba(255,255,255,0.12)");
    drawSoftBlob(roughnessContext, x, y, 18 + random() * 20, "rgba(220,220,220,0.06)");
  }
}

function paintBrickTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let layer = 0; layer < 12; layer += 1) {
    const y = layer * 42 + random() * 16;
    const bandHeight = 18 + random() * 14;
    colorContext.fillStyle = pick(random, ["rgba(158,88,61,0.32)", "rgba(194,121,85,0.28)", "rgba(120,63,47,0.24)"]);
    colorContext.fillRect(-10, y, TERRAIN_TEXTURE_SIZE + 20, bandHeight);
    bumpContext.fillStyle = "rgba(175,175,175,0.08)";
    bumpContext.fillRect(-10, y, TERRAIN_TEXTURE_SIZE + 20, bandHeight * 0.72);
  }

  colorContext.strokeStyle = "rgba(83,44,29,0.34)";
  bumpContext.strokeStyle = "rgba(255,255,255,0.22)";
  roughnessContext.strokeStyle = "rgba(60,60,60,0.12)";
  for (let crack = 0; crack < 90; crack += 1) {
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

  for (let index = 0; index < 22; index += 1) {
    drawSoftBlob(overlayContext, random() * TERRAIN_TEXTURE_SIZE, random() * TERRAIN_TEXTURE_SIZE, 20 + random() * 28, "rgba(255,246,232,0.08)");
  }
}

function paintWoolTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let index = 0; index < 180; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    const radiusX = 14 + random() * 30;
    const radiusY = 12 + random() * 24;
    drawEllipse(colorContext, x, y, radiusX, radiusY, pick(random, ["rgba(124,173,90,0.28)", "rgba(174,222,116,0.26)", "rgba(234,249,198,0.1)"]));
    drawEllipse(bumpContext, x, y, radiusX * 0.82, radiusY * 0.82, "rgba(210,210,210,0.12)");
  }

  for (let index = 0; index < 64; index += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawSoftBlob(colorContext, x, y, 10 + random() * 16, "rgba(248,255,241,0.08)");
    drawSoftBlob(overlayContext, x, y, 18 + random() * 18, "rgba(255,255,255,0.13)");
    drawSoftBlob(roughnessContext, x, y, 12 + random() * 18, "rgba(228,228,228,0.05)");
  }

  drawSpeckles(colorContext, random, 1200, "rgba(32,64,20,0.05)", 0.8, 1.8);
}

function paintDesertTerrain(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  overlayContext: CanvasRenderingContext2D,
  random: () => number
): void {
  for (let dune = 0; dune < 18; dune += 1) {
    const baseY = dune * 32 + random() * 14;
    colorContext.strokeStyle = pick(random, ["rgba(236,198,126,0.18)", "rgba(196,152,88,0.15)", "rgba(255,232,191,0.12)"]);
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

  for (let ripple = 0; ripple < 260; ripple += 1) {
    const x = random() * TERRAIN_TEXTURE_SIZE;
    const y = random() * TERRAIN_TEXTURE_SIZE;
    drawEllipse(bumpContext, x, y, 8 + random() * 14, 1.2 + random() * 2.4, "rgba(220,220,220,0.08)", random() * Math.PI);
    drawEllipse(overlayContext, x, y, 12 + random() * 18, 2 + random() * 3, "rgba(255,255,255,0.06)", random() * Math.PI);
  }

  drawSpeckles(colorContext, random, 1600, "rgba(107,76,37,0.06)", 0.8, 2.2);
}

function drawBaseGradients(
  colorContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  resource: TerrainResource
): void {
  const base = TILE_COLORS[resource];
  const colorGradient = colorContext.createLinearGradient(0, 0, TERRAIN_TEXTURE_SIZE, TERRAIN_TEXTURE_SIZE);
  colorGradient.addColorStop(0, tint(base, 0.18));
  colorGradient.addColorStop(0.52, base);
  colorGradient.addColorStop(1, tint(base, -0.18));
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

function createCanvasTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
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
