import type { CSSProperties } from "react";
import type { PortType, Resource } from "@hexagonia/shared";

export type TerrainResource = Resource | "desert";

const RESOURCE_ICON_PALETTE: Record<TerrainResource, { color: string; surface: string }> = {
  brick: { color: "#e39a79", surface: "rgba(180, 93, 67, 0.24)" },
  lumber: { color: "#84d07d", surface: "rgba(47, 109, 53, 0.26)" },
  ore: { color: "#dfe7f0", surface: "rgba(120, 131, 149, 0.42)" },
  grain: { color: "#f0cb69", surface: "rgba(196, 160, 56, 0.24)" },
  wool: { color: "#eef9db", surface: "rgba(169, 203, 132, 0.28)" },
  desert: { color: "#f0d79c", surface: "rgba(200, 177, 120, 0.24)" }
};
const PORT_TERRAIN_COLORS: Record<Resource, string> = {
  brick: "#b86146",
  lumber: "#2f6f37",
  ore: "#79869a",
  grain: "#c7a13a",
  wool: "#a8cc79"
};

export function getResourceIconColor(resource: TerrainResource): string {
  return RESOURCE_ICON_PALETTE[resource].color;
}

export function ResourceIcon(props: {
  resource: TerrainResource;
  size?: number;
  className?: string;
  shell?: boolean;
  tone?: "accent" | "light";
}) {
  const { resource, size = 18, className, shell = false, tone = "accent" } = props;
  const palette = RESOURCE_ICON_PALETTE[resource];
  const style = {
    "--resource-icon-size": `${size}px`,
    "--resource-icon-color": tone === "light" ? "#f4edd8" : palette.color,
    "--resource-icon-surface": tone === "light" ? "rgba(255, 255, 255, 0.08)" : palette.surface
  } as CSSProperties;

  return (
    <span
      className={["resource-icon", shell ? "is-shell" : "", tone === "light" ? "is-light" : "is-accent", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {renderResourceIconSvg(resource)}
      </svg>
    </span>
  );
}

export function HarborIcon(props: {
  size?: number;
  className?: string;
  color?: string;
  shell?: boolean;
}) {
  const { size = 18, className, color = "#f4edd8", shell = false } = props;
  const style = {
    "--resource-icon-size": `${size}px`,
    "--resource-icon-color": color,
    "--resource-icon-surface": "rgba(255, 255, 255, 0.08)"
  } as CSSProperties;

  return (
    <span
      className={["resource-icon", shell ? "is-shell" : "", "is-light", className ?? ""].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="4.4" r="2.8" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 7.4V20.2M6.2 11h11.6M12 20.2c-4.4 0-7.4-2.2-7.7-6.2h2.8M12 20.2c4.4 0 7.4-2.2 7.7-6.2h-2.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function PortMarkerIcon(props: {
  type: PortType;
  size?: number;
  className?: string;
}) {
  const { type, size = 40, className } = props;
  const palette = getPortMarkerBadgePalette(type);
  const style = {
    "--port-marker-size": `${size}px`,
    "--port-badge-outer": palette.badgeOuter,
    "--port-badge-core": palette.badgeCore,
    "--port-badge-ring": palette.badgeRing,
    "--port-badge-inner-ring": palette.badgeInnerRing,
    "--port-badge-inset": palette.badgeInset
  } as CSSProperties;

  return (
    <span className={["port-marker-icon", className ?? ""].filter(Boolean).join(" ")} style={style} aria-hidden="true">
      <span className="port-marker-icon-inner-ring" />
      <span className="port-marker-icon-core">
        <HarborIcon size={size * 0.46} color="#f5edd6" />
      </span>
      {type !== "generic" ? (
        <span className="port-marker-icon-resource">
          <ResourceIcon resource={type} tone="light" size={size * 0.21} />
        </span>
      ) : null}
    </span>
  );
}

export function drawResourceIcon(
  context: CanvasRenderingContext2D,
  resource: TerrainResource,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const scale = size / 24;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.9;
  context.lineCap = "round";
  context.lineJoin = "round";

  switch (resource) {
    case "brick":
      drawRoundedRect(context, -8.5, -6.5, 17, 5, 1.1, false, true);
      drawRoundedRect(context, -9.5, 0.5, 8.5, 5, 1.1, false, true);
      drawRoundedRect(context, 1.2, 0.5, 8.3, 5, 1.1, false, true);
      break;
    case "lumber":
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(-5.8, -1.5);
      context.lineTo(-2.4, -1.5);
      context.lineTo(-6.8, 4);
      context.lineTo(-2.1, 4);
      context.lineTo(-2.1, 8);
      context.lineTo(2.1, 8);
      context.lineTo(2.1, 4);
      context.lineTo(6.8, 4);
      context.lineTo(2.4, -1.5);
      context.lineTo(5.8, -1.5);
      context.closePath();
      context.stroke();
      break;
    case "ore":
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(-7, -4);
      context.lineTo(-5.8, 5.5);
      context.lineTo(0, 9);
      context.lineTo(5.8, 5.5);
      context.lineTo(7, -4);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(0, 9);
      context.moveTo(-7, -4);
      context.lineTo(5.8, 5.5);
      context.moveTo(7, -4);
      context.lineTo(-5.8, 5.5);
      context.stroke();
      break;
    case "grain":
      context.beginPath();
      context.moveTo(0, 9);
      context.lineTo(0, -8);
      context.stroke();
      drawGrainKernel(context, -3.8, -5.4, -0.8);
      drawGrainKernel(context, 3.8, -4.2, 0.8);
      drawGrainKernel(context, -3.8, -1.4, -0.8);
      drawGrainKernel(context, 3.8, -0.2, 0.8);
      drawGrainKernel(context, -3.8, 2.6, -0.8);
      drawGrainKernel(context, 3.8, 3.8, 0.8);
      break;
    case "wool":
      context.beginPath();
      context.arc(-4.8, 1.2, 3.7, 0, Math.PI * 2);
      context.arc(0, -1.6, 4.6, 0, Math.PI * 2);
      context.arc(4.9, 1.2, 3.8, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-7.2, 5.8);
      context.lineTo(7.2, 5.8);
      context.stroke();
      break;
    case "desert":
      context.beginPath();
      context.arc(5.4, -5.6, 3.1, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-9, 5.3);
      context.quadraticCurveTo(-5.5, 1.2, -1.8, 4.3);
      context.quadraticCurveTo(2.1, 7.3, 5.6, 4.5);
      context.quadraticCurveTo(8.2, 2.4, 9.2, 5.3);
      context.stroke();
      break;
  }

  context.restore();
}

function renderResourceIconSvg(resource: TerrainResource) {
  switch (resource) {
    case "brick":
      return (
        <>
          <rect x="3.5" y="4.5" width="17" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="2.5" y="11.5" width="8.5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="11.5" width="8.5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
        </>
      );
    case "lumber":
      return (
        <path
          d="M12 3.5 6.2 10.1h3.1L5.4 14.8h4.1v4.4h5v-4.4h4.1l-3.9-4.7h3.1L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      );
    case "ore":
      return (
        <>
          <path d="M12 3.2 5.1 7.8 6.4 17l5.6 3.3 5.6-3.3 1.3-9.2L12 3.2Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 3.2V20.3M5.1 7.8 17.6 17M18.9 7.8 6.4 17" stroke="currentColor" strokeWidth="1.6" />
        </>
      );
    case "grain":
      return (
        <>
          <path d="M12 21V4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          {renderGrainKernelSvg(8.2, 6.6, -45.84)}
          {renderGrainKernelSvg(15.8, 7.8, 45.84)}
          {renderGrainKernelSvg(8.2, 10.6, -45.84)}
          {renderGrainKernelSvg(15.8, 11.8, 45.84)}
          {renderGrainKernelSvg(8.2, 14.6, -45.84)}
          {renderGrainKernelSvg(15.8, 15.8, 45.84)}
        </>
      );
    case "wool":
      return (
        <>
          <circle cx="7.2" cy="13.1" r="3.3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="10" r="4.1" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16.8" cy="13.1" r="3.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.8 16.8h14.4" stroke="currentColor" strokeWidth="1.8" />
        </>
      );
    case "desert":
      return (
        <>
          <circle cx="17.1" cy="6.7" r="2.8" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M3.4 16.2c2.2-3.2 5-3.5 7-1.2 2.7 3.2 5.3 2.6 8.1-.4 1.1-1.2 1.7-1.7 2.1 1.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      );
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
  if (fill) {
    context.fill();
  }
  if (stroke) {
    context.stroke();
  }
}

function renderGrainKernelSvg(x: number, y: number, rotation: number) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx="1.8"
      ry="3.3"
      transform={`rotate(${rotation} ${x} ${y})`}
      stroke="currentColor"
      strokeWidth="1.8"
    />
  );
}

export function getPortMarkerBadgePalette(type: PortType): {
  badgeOuter: string;
  badgeCore: string;
  badgeRing: string;
  badgeInnerRing: string;
  badgeInset: string;
} {
  if (type === "generic") {
    return {
      badgeOuter: "rgba(9, 18, 27, 0.98)",
      badgeCore: "rgba(19, 36, 49, 0.98)",
      badgeRing: "rgba(232, 210, 158, 0.82)",
      badgeInnerRing: "rgba(255, 255, 255, 0.08)",
      badgeInset: "rgba(240, 222, 174, 0.14)"
    };
  }

  const accent = getResourceIconColor(type);
  const terrain = PORT_TERRAIN_COLORS[type];
  return {
    badgeOuter: shadeColor(terrain, -0.18),
    badgeCore: shadeColor(terrain, 0.04),
    badgeRing: accent,
    badgeInnerRing: "rgba(255, 255, 255, 0.14)",
    badgeInset: "rgba(255, 255, 255, 0.12)"
  };
}

function shadeColor(color: string, lightnessOffset: number): string {
  const normalized = color.replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  const red = Number.parseInt(full.slice(0, 2), 16) / 255;
  const green = Number.parseInt(full.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6;
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
        break;
    }
  }

  const nextLightness = Math.max(0, Math.min(1, lightness + lightnessOffset));
  const chroma = (1 - Math.abs(2 * nextLightness - 1)) * saturation;
  const hueSegment = ((hue * 60) % 360 + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  let nextRed = 0;
  let nextGreen = 0;
  let nextBlue = 0;

  if (hueSegment < 1) {
    nextRed = chroma;
    nextGreen = secondary;
  } else if (hueSegment < 2) {
    nextRed = secondary;
    nextGreen = chroma;
  } else if (hueSegment < 3) {
    nextGreen = chroma;
    nextBlue = secondary;
  } else if (hueSegment < 4) {
    nextGreen = secondary;
    nextBlue = chroma;
  } else if (hueSegment < 5) {
    nextRed = secondary;
    nextBlue = chroma;
  } else {
    nextRed = chroma;
    nextBlue = secondary;
  }

  const match = nextLightness - chroma / 2;
  return `#${[nextRed, nextGreen, nextBlue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function drawGrainKernel(context: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  context.ellipse(0, 0, 1.8, 3.3, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
