import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MatchSnapshot, PortType, Resource } from "@hexagonia/shared";
import { createUltraTerrainTextureBundle, type UltraTerrainTextureBundle } from "./boardUltraTerrain";
import { createFancyTileProps as createLandingFancyTileProps } from "./LandingBoardScene";
import { TILE_COLORS, type BoardVisualSettings } from "./boardVisuals";
import { drawResourceIcon, getResourceIconColor } from "./resourceIcons";
import { renderResourceLabel } from "./ui";

export type InteractionMode = "road" | "settlement" | "city" | "robber" | "road_building" | null;
export interface BoardFocusBadge {
  label: string;
  playerId?: string;
  tone?: "neutral" | "player" | "warning";
}

export interface BoardFocusCue {
  key: string;
  mode: "event" | "action";
  title: string;
  detail: string;
  badges?: BoardFocusBadge[];
  vertexIds: string[];
  edgeIds: string[];
  tileIds: string[];
  scale: "tight" | "medium" | "wide";
}

interface BoardSceneProps {
  snapshot: MatchSnapshot;
  visualSettings: BoardVisualSettings;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  focusCue: BoardFocusCue | null;
  cameraCue: BoardFocusCue | null;
  onVertexSelect: (vertexId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onTileSelect: (tileId: string) => void;
}

const TILE_HEIGHT = 1.18;
const BUILT_ROAD_RADIUS = 0.24;
const GUIDE_ROAD_RADIUS = 0.14;
const PORT_MARKER_DISTANCE = 1.9;
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 52, 46);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const ULTRA_TILE_OVERLAY_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const ULTRA_TILE_OVERLAY_FRAGMENT_SHADER = `
uniform sampler2D uMask;
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform float uTime;
uniform float uOpacity;
uniform float uMotionScale;
uniform float uStyleIndex;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  float speed = 0.18 + uStyleIndex * 0.025;
  vec2 baseUv = vUv;
  vec2 flow = vec2(
    sin((baseUv.y + uStyleIndex * 0.17) * 12.0 + uTime * (speed + 0.16)) * 0.018,
    cos((baseUv.x - uStyleIndex * 0.11) * 10.0 + uTime * (speed * 0.78 + 0.1)) * 0.014
  ) * uMotionScale;
  float mask = texture2D(uMask, fract(baseUv + flow)).r;
  float shimmer = 0.5 + 0.5 * sin((baseUv.x * 14.0 + baseUv.y * 16.0) + uTime * (0.32 + uStyleIndex * 0.06));
  float sparkle = noise(baseUv * 9.0 + vec2(uTime * 0.06, -uTime * 0.04));
  float alpha = smoothstep(0.34, 0.94, mask) * (0.42 + shimmer * 0.32 + sparkle * 0.18) * uOpacity;
  vec3 color = mix(uBaseColor, uAccentColor, clamp(shimmer * 0.72 + sparkle * 0.28, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

interface MaterialState {
  material: THREE.Material | THREE.SpriteMaterial;
  opacity?: number;
  emissiveIntensity?: number;
  color?: THREE.Color;
}

interface InteractiveMeta {
  kind: "tile" | "edge" | "vertex" | "port";
  id: string;
  baseScale: THREE.Vector3;
  hoverScale: number;
  materialStates: MaterialState[];
  marker?: THREE.Object3D;
}

interface FocusGeometry {
  x: number;
  z: number;
  span: number;
}

interface BoardTooltipState {
  title: string;
  detail: string;
  x: number;
  y: number;
  accentColor: string;
}

interface ReliefAnchor {
  x: number;
  z: number;
  scale: number;
  angle: number;
}

interface ReliefOccupiedArea {
  x: number;
  z: number;
  radius: number;
}

interface ReliefAnchorOptions {
  occupied?: ReliefOccupiedArea[];
  minGap?: number;
  footprintScale?: number;
  radialBias?: number;
  stretchZ?: number;
  candidatesPerAnchor?: number;
}

interface TileDecorationOptions {
  includeProps: boolean;
  includeTerrainRelief: boolean;
}

interface TexturedTileOptions extends TileDecorationOptions {
  animatedMaterials: UltraTileOverlayMaterial[];
  reducedMotion: boolean;
  animateOverlay: boolean;
}

const RELIEF_TOKEN_CLEAR_RADIUS = 1.56;

function createBoardStructureKey(board: MatchSnapshot["board"]): string {
  const tileKey = board.tiles
    .map((tile) => `${tile.id}:${tile.resource}:${tile.x.toFixed(3)}:${tile.y.toFixed(3)}:${tile.vertexIds.join(",")}`)
    .join("|");
  const vertexKey = board.vertices.map((vertex) => `${vertex.id}:${vertex.x.toFixed(3)}:${vertex.y.toFixed(3)}`).join("|");
  const edgeKey = board.edges.map((edge) => `${edge.id}:${edge.vertexIds.join(",")}:${edge.tileIds.join(",")}`).join("|");
  const portKey = board.ports.map((port) => `${port.id}:${port.type}:${port.edgeId}`).join("|");
  return [tileKey, vertexKey, edgeKey, portKey].join("~");
}

function getCyclicVariant<T>(variants: readonly [T, ...T[]], index: number): T {
  return variants[index % variants.length] ?? variants[0];
}

interface UltraTileOverlayUniforms {
  uMask: THREE.IUniform<THREE.Texture>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uAccentColor: THREE.IUniform<THREE.Color>;
  uTime: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uMotionScale: THREE.IUniform<number>;
  uStyleIndex: THREE.IUniform<number>;
}

type UltraTileOverlayMaterial = THREE.ShaderMaterial & {
  uniforms: UltraTileOverlayUniforms;
  userData: THREE.ShaderMaterial["userData"] & {
    motionBase: number;
  };
};

type UltraTileReliefMode = "none" | "props" | "terrain" | "full";
type ReliefPropLayer = "hero" | "accent" | "detail";

function getReliefPropScaleBoost(
  reliefMode: Exclude<UltraTileReliefMode, "none">,
  layer: ReliefPropLayer
): number {
  if (reliefMode === "props") {
    switch (layer) {
      case "hero":
        return 2.35;
      case "accent":
        return 2.05;
      case "detail":
        return 1.7;
    }
  }

  switch (layer) {
    case "hero":
      return 1.65;
    case "accent":
      return 1.45;
    case "detail":
      return 1.25;
  }
}

function getReliefPropRenderBoost(
  reliefMode: Exclude<UltraTileReliefMode, "none">,
  layer: ReliefPropLayer
): number {
  if (reliefMode === "props") {
    switch (layer) {
      case "hero":
        return 1.22;
      case "accent":
        return 1.34;
      case "detail":
        return 1.28;
    }
  }

  switch (layer) {
    case "hero":
      return 1.14;
    case "accent":
      return 1.22;
    case "detail":
      return 1.18;
  }
}

function applyReliefPropPresentation<T extends THREE.Object3D>(
  object: T,
  reliefMode: Exclude<UltraTileReliefMode, "none">,
  layer: ReliefPropLayer
): T {
  object.scale.multiplyScalar(getReliefPropRenderBoost(reliefMode, layer));
  return object;
}

export function BoardScene(props: BoardSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const staticBoardLayerRef = useRef<THREE.Group | null>(null);
  const dynamicBoardLayerRef = useRef<THREE.Group | null>(null);
  const interactiveRef = useRef<THREE.Object3D[]>([]);
  const staticInteractiveRef = useRef<THREE.Object3D[]>([]);
  const dynamicInteractiveRef = useRef<THREE.Object3D[]>([]);
  const staticTileObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const dynamicStaticInteractiveRef = useRef<THREE.Object3D[]>([]);
  const pulseObjectsRef = useRef<THREE.Object3D[]>([]);
  const ultraAnimatedMaterialsRef = useRef<UltraTileOverlayMaterial[]>([]);
  const focusTargetRef = useRef(DEFAULT_CAMERA_TARGET.clone());
  const focusCameraPositionRef = useRef(DEFAULT_CAMERA_POSITION.clone());
  const lastFocusKeyRef = useRef<string | null>(null);
  const autoFlightRef = useRef(false);
  const userInteractingRef = useRef(false);
  const hoveredInteractiveRef = useRef<THREE.Object3D | null>(null);
  const reducedMotionRef = useRef(false);
  const [boardTooltip, setBoardTooltip] = useState<BoardTooltipState | null>(null);
  const handlersRef = useRef({
    onVertexSelect: props.onVertexSelect,
    onEdgeSelect: props.onEdgeSelect,
    onTileSelect: props.onTileSelect
  });
  const boardStructureKey = useMemo(() => createBoardStructureKey(props.snapshot.board), [props.snapshot.board]);

  useEffect(() => {
    handlersRef.current = {
      onVertexSelect: props.onVertexSelect,
      onEdgeSelect: props.onEdgeSelect,
      onTileSelect: props.onTileSelect
    };
  }, [props.onEdgeSelect, props.onTileSelect, props.onVertexSelect]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current || rendererRef.current) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#091520");
    scene.fog = new THREE.Fog("#091520", 80, 180);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.copy(DEFAULT_CAMERA_POSITION);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableDamping = false;
    controls.dampingFactor = 0;
    controls.panSpeed = 1.08;
    controls.rotateSpeed = 0.92;
    controls.zoomSpeed = 1.05;
    controls.screenSpacePanning = true;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    controls.minDistance = 28;
    controls.maxDistance = 88;
    controls.maxPolarAngle = Math.PI / 2.12;
    const applyControlScheme = (tiltMode: boolean) => {
      controls.mouseButtons.LEFT = tiltMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      controls.mouseButtons.RIGHT = tiltMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = THREE.TOUCH.PAN;
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    };
    applyControlScheme(false);
    controls.update();
    focusTargetRef.current.copy(DEFAULT_CAMERA_TARGET);
    focusCameraPositionRef.current.copy(DEFAULT_CAMERA_POSITION);
    renderer.domElement.style.cursor = "";

    scene.add(new THREE.AmbientLight("#dce6ea", 1.2));
    const keyLight = new THREE.DirectionalLight("#f5e8cb", 1.8);
    keyLight.position.set(24, 36, 16);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#6ab6ea", 0.62);
    fillLight.position.set(-20, 18, -20);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight("#f0c373", 1.6, 72, 2);
    rimLight.position.set(0, 12, 0);
    scene.add(rimLight);

    const onControlStart = () => {
      userInteractingRef.current = true;
      autoFlightRef.current = false;
      renderer.domElement.style.cursor = "grabbing";
    };
    const onControlEnd = () => {
      if (!cameraRef.current || !controlsRef.current) {
        return;
      }

      userInteractingRef.current = false;
      focusTargetRef.current.copy(controlsRef.current.target);
      focusCameraPositionRef.current.copy(cameraRef.current.position);
      renderer.domElement.style.cursor = hoveredInteractiveRef.current ? "pointer" : "";
    };
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("end", onControlEnd);
    const syncModifierScheme = (ctrlPressed: boolean) => {
      applyControlScheme(ctrlPressed);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        syncModifierScheme(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        syncModifierScheme(false);
      }
    };
    const onWindowBlur = () => {
      syncModifierScheme(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(44, 48, 4, 48),
      new THREE.MeshStandardMaterial({
        color: "#102638",
        roughness: 0.94,
        metalness: 0.08
      })
    );
    table.position.y = -3.2;
    table.receiveShadow = true;
    scene.add(table);

    const boardRoot = new THREE.Group();
    const staticLayer = new THREE.Group();
    const dynamicLayer = new THREE.Group();
    boardRoot.add(staticLayer, dynamicLayer);
    scene.add(boardRoot);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    boardGroupRef.current = boardRoot;
    staticBoardLayerRef.current = staticLayer;
    dynamicBoardLayerRef.current = dynamicLayer;

    const handleResize = () => {
      const container = mountRef.current;
      if (!container || !rendererRef.current || !cameraRef.current) {
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      rendererRef.current.setSize(width, height, false);
      cameraRef.current.aspect = width / Math.max(height, 1);
      cameraRef.current.updateProjectionMatrix();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const CLICK_MOVE_THRESHOLD_PX = 8;
    const CLICK_HOLD_THRESHOLD_MS = 320;
    let pendingClick:
      | {
          pointerId: number;
          clientX: number;
          clientY: number;
          startedAt: number;
          kind: Exclude<InteractiveMeta["kind"], "port">;
          id: string;
          cancelled: boolean;
        }
      | null = null;

    const updateHoveredObject = (nextObject: THREE.Object3D | null) => {
      if (hoveredInteractiveRef.current === nextObject) {
        return;
      }

      setInteractiveHoverState(hoveredInteractiveRef.current, false);
      hoveredInteractiveRef.current = nextObject;
      setInteractiveHoverState(nextObject, true);
      if (!userInteractingRef.current) {
        renderer.domElement.style.cursor = nextObject ? "pointer" : "";
      }
    };

    const updateBoardTooltip = (target: THREE.Object3D | null, event?: PointerEvent) => {
      const tooltip = target?.userData?.tooltip as
        | { title: string; detail: string; accentColor: string }
        | undefined;
      if (!tooltip || !event || !mountRef.current) {
        setBoardTooltip(null);
        return;
      }

      const rect = mountRef.current.getBoundingClientRect();
      const tooltipWidth = Math.min(248, Math.max(rect.width - 24, 160));
      const tooltipHeight = 112;
      const x = Math.min(
        Math.max(event.clientX - rect.left + 16, 12),
        Math.max(12, rect.width - tooltipWidth - 12)
      );
      const y = Math.min(
        Math.max(event.clientY - rect.top + 16, 12),
        Math.max(12, rect.height - tooltipHeight - 12)
      );

      setBoardTooltip({
        title: tooltip.title,
        detail: tooltip.detail,
        x,
        y,
        accentColor: tooltip.accentColor
      });
    };

    const getInteractiveObjectAtPointer = (event: PointerEvent) => {
      const rendererNode = rendererRef.current?.domElement;
      const cameraNode = cameraRef.current;
      if (!rendererNode || !cameraNode) {
        return null;
      }

      const rect = rendererNode.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraNode);
      const intersections = raycaster.intersectObjects(interactiveRef.current, true);
      return resolveInteractiveObject(intersections[0]?.object ?? null);
    };

    const triggerInteractiveSelection = (hit: { kind: Exclude<InteractiveMeta["kind"], "port">; id: string }) => {
      if (hit.kind === "tile") {
        handlersRef.current.onTileSelect(hit.id);
      }
      if (hit.kind === "edge") {
        handlersRef.current.onEdgeSelect(hit.id);
      }
      if (hit.kind === "vertex") {
        handlersRef.current.onVertexSelect(hit.id);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pendingClick && event.pointerId === pendingClick.pointerId) {
        const distance = Math.hypot(event.clientX - pendingClick.clientX, event.clientY - pendingClick.clientY);
        if (distance > CLICK_MOVE_THRESHOLD_PX) {
          pendingClick.cancelled = true;
        }
      }

      const target = getInteractiveObjectAtPointer(event);
      updateHoveredObject(target);
      updateBoardTooltip(target, event);
    };

    const onPointerLeave = () => {
      pendingClick = null;
      updateHoveredObject(null);
      setBoardTooltip(null);
      if (!userInteractingRef.current) {
        renderer.domElement.style.cursor = "";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      syncModifierScheme(event.ctrlKey);
      if (event.button !== 0) {
        pendingClick = null;
        return;
      }

      const target = getInteractiveObjectAtPointer(event);
      const hit = target?.userData as { kind?: InteractiveMeta["kind"]; id?: string } | undefined;
      if (!hit?.kind || !hit.id || hit.kind === "port") {
        pendingClick = null;
        return;
      }

      pendingClick = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startedAt: performance.now(),
        kind: hit.kind,
        id: hit.id,
        cancelled: false
      };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pendingClick || event.pointerId !== pendingClick.pointerId) {
        return;
      }

      const click = pendingClick;
      pendingClick = null;

      if (event.button !== 0) {
        return;
      }

      if (click.cancelled || performance.now() - click.startedAt > CLICK_HOLD_THRESHOLD_MS) {
        return;
      }

      const target = getInteractiveObjectAtPointer(event);
      const hit = target?.userData as { kind?: InteractiveMeta["kind"]; id?: string } | undefined;
      if (!hit?.kind || !hit.id || hit.kind === "port") {
        return;
      }

      if (hit.kind !== click.kind || hit.id !== click.id) {
        return;
      }

      triggerInteractiveSelection(click);
    };

    const onPointerCancel = () => {
      pendingClick = null;
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.setAnimationLoop(() => {
      const pulse = performance.now() * 0.005;
      const elapsedSeconds = performance.now() * 0.001;
      if (autoFlightRef.current && !userInteractingRef.current) {
        controls.target.lerp(focusTargetRef.current, 0.12);
        camera.position.lerp(focusCameraPositionRef.current, 0.12);

        if (
          controls.target.distanceToSquared(focusTargetRef.current) < 0.04 &&
          camera.position.distanceToSquared(focusCameraPositionRef.current) < 0.08
        ) {
          controls.target.copy(focusTargetRef.current);
          camera.position.copy(focusCameraPositionRef.current);
          autoFlightRef.current = false;
        }
      }
      for (const object of pulseObjectsRef.current) {
        const baseScale = object.userData.baseScale as THREE.Vector3 | undefined;
        if (!baseScale) {
          continue;
        }

        const hovered = !!object.userData.hovered;
        const hoverScaleMultiplier = hovered ? (object.userData.hoverScaleMultiplier as number | undefined) ?? 1.12 : 1;
        const pulseIntensity = hovered ? "strong" : object.userData.pulseIntensity;
        const intensity = pulseIntensity === "strong" ? 0.14 : 0.08;
        const scale = 1 + Math.sin(pulse) * intensity;
        object.scale.set(
          baseScale.x * hoverScaleMultiplier * scale,
          baseScale.y * hoverScaleMultiplier * scale,
          baseScale.z * hoverScaleMultiplier * scale
        );

        const materialStates = (object.userData.materialStates as MaterialState[] | undefined) ?? [];
        for (const state of materialStates) {
          if (typeof state.opacity === "number") {
            state.material.opacity = hovered
              ? Math.min(state.opacity + 0.24, 1)
              : pulseIntensity === "strong"
                ? Math.min(state.opacity + 0.18, 1)
                : Math.min(state.opacity + 0.08, 1);
          }
          if (typeof state.emissiveIntensity === "number" && "emissiveIntensity" in state.material) {
            state.material.emissiveIntensity = hovered
              ? state.emissiveIntensity + 0.24
              : pulseIntensity === "strong"
                ? state.emissiveIntensity + 0.12
                : state.emissiveIntensity;
          }
        }
      }
      for (const material of ultraAnimatedMaterialsRef.current) {
        material.uniforms.uTime.value = elapsedSeconds;
        material.uniforms.uMotionScale.value = (material.userData.motionBase as number) * (reducedMotionRef.current ? 0.12 : 1);
      }
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      if (boardGroupRef.current) {
        disposeObjectTree(boardGroupRef.current);
        scene.remove(boardGroupRef.current);
        boardGroupRef.current = null;
      }
      staticBoardLayerRef.current = null;
      dynamicBoardLayerRef.current = null;
      staticInteractiveRef.current = [];
      dynamicInteractiveRef.current = [];
      staticTileObjectsRef.current = new Map();
      dynamicStaticInteractiveRef.current = [];
      interactiveRef.current = [];
      pulseObjectsRef.current = [];
      ultraAnimatedMaterialsRef.current = [];
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const boardRoot = boardGroupRef.current;
    if (!boardRoot) {
      return;
    }

    setBoardTooltip(null);
    setInteractiveHoverState(hoveredInteractiveRef.current, false);
    hoveredInteractiveRef.current = null;
    if (rendererRef.current && !userInteractingRef.current) {
      rendererRef.current.domElement.style.cursor = "";
    }

    const staleStaticInteractive = new Set(dynamicStaticInteractiveRef.current);
    for (const object of dynamicStaticInteractiveRef.current) {
      clearInteractiveMeta(object);
    }
    dynamicStaticInteractiveRef.current = [];
    dynamicInteractiveRef.current = dynamicInteractiveRef.current.filter((object) => !staleStaticInteractive.has(object));
    staticInteractiveRef.current = [];
    staticTileObjectsRef.current = new Map();
    ultraAnimatedMaterialsRef.current = [];

    if (staticBoardLayerRef.current) {
      boardRoot.remove(staticBoardLayerRef.current);
      disposeObjectTree(staticBoardLayerRef.current);
    }

    const group = new THREE.Group();
    staticBoardLayerRef.current = group;
    boardRoot.add(group);

    const verticesById = new Map(props.snapshot.board.vertices.map((vertex) => [vertex.id, vertex]));
    const tilesById = new Map(props.snapshot.board.tiles.map((tile) => [tile.id, tile]));
    const edgesById = new Map(props.snapshot.board.edges.map((edge) => [edge.id, edge]));
    const texturedTerrainBundles = new Map<Resource | "desert", UltraTerrainTextureBundle>();
    const useTexturedTiles = props.visualSettings.textures;
    const includeProps = props.visualSettings.props;
    const includeTerrainRelief = props.visualSettings.terrainRelief;
    const animateOverlay = useTexturedTiles && props.visualSettings.terrainMotion;

    for (const tile of props.snapshot.board.tiles) {
      if (useTexturedTiles && !texturedTerrainBundles.has(tile.resource)) {
        texturedTerrainBundles.set(tile.resource, createUltraTerrainTextureBundle(tile.resource));
      }
      const base =
        useTexturedTiles
          ? createTexturedTileMesh(tile, verticesById, false, texturedTerrainBundles.get(tile.resource)!, {
              includeProps,
              includeTerrainRelief,
              animatedMaterials: ultraAnimatedMaterialsRef.current,
              reducedMotion: reducedMotionRef.current,
              animateOverlay
            })
          : createModernTileMesh(tile, verticesById, false, {
              includeProps,
              includeTerrainRelief
            });
      base.position.set(tile.x, 0, tile.y);
      applyTileMeshShadowState(base);
      group.add(base);
      staticTileObjectsRef.current.set(tile.id, base);

      const outline = createTileOutline(tile, verticesById);
      outline.position.set(tile.x, TILE_HEIGHT + 0.04, tile.y);
      group.add(outline);
    }

    for (const port of props.snapshot.board.ports) {
      const edge = edgesById.get(port.edgeId);
      if (!edge || edge.tileIds.length !== 1) {
        continue;
      }

      const [tileId] = edge.tileIds;
      if (!tileId) {
        continue;
      }

      const tile = tilesById.get(tileId);
      if (!tile) {
        continue;
      }

      const marker = createPortMarker(port, edge, tile, verticesById);
      attachInteractiveMeta(marker, "port", port.id, 1.04);
      marker.userData.tooltip = getPortTooltip(port.type);
      staticInteractiveRef.current.push(marker);
      group.add(marker);
    }

    interactiveRef.current = [...staticInteractiveRef.current, ...dynamicInteractiveRef.current];
  }, [
    boardStructureKey,
    props.visualSettings.props,
    props.visualSettings.terrainMotion,
    props.visualSettings.terrainRelief,
    props.visualSettings.textures
  ]);

  useEffect(() => {
    const boardRoot = boardGroupRef.current;
    if (!boardRoot) {
      return;
    }

    setBoardTooltip(null);
    setInteractiveHoverState(hoveredInteractiveRef.current, false);
    hoveredInteractiveRef.current = null;
    if (rendererRef.current && !userInteractingRef.current) {
      rendererRef.current.domElement.style.cursor = "";
    }

    for (const object of dynamicStaticInteractiveRef.current) {
      clearInteractiveMeta(object);
    }
    dynamicStaticInteractiveRef.current = [];
    dynamicInteractiveRef.current = [];
    pulseObjectsRef.current = [];

    if (dynamicBoardLayerRef.current) {
      boardRoot.remove(dynamicBoardLayerRef.current);
      disposeObjectTree(dynamicBoardLayerRef.current);
    }

    const group = new THREE.Group();
    dynamicBoardLayerRef.current = group;
    boardRoot.add(group);

    const verticesById = new Map(props.snapshot.board.vertices.map((vertex) => [vertex.id, vertex]));
    const legalVertices = new Set(
      props.snapshot.allowedMoves.initialSettlementVertexIds.length
        ? props.snapshot.allowedMoves.initialSettlementVertexIds
        : props.interactionMode === "settlement"
          ? props.snapshot.allowedMoves.settlementVertexIds
          : props.interactionMode === "city"
            ? props.snapshot.allowedMoves.cityVertexIds
            : []
    );
    const legalEdges = new Set(
      props.snapshot.allowedMoves.initialRoadEdgeIds.length
        ? props.snapshot.allowedMoves.initialRoadEdgeIds
        : props.interactionMode === "road" || props.interactionMode === "road_building"
          ? props.snapshot.allowedMoves.roadEdgeIds
          : []
    );
    const selectedRoadEdges = new Set(props.selectedRoadEdges);
    const robberTileIds = new Set(
      props.interactionMode === "robber"
        ? props.snapshot.allowedMoves.robberMoveOptions.map((option) => option.tileId)
        : []
    );

    for (const tile of props.snapshot.board.tiles) {
      const tokenSprite = createTokenSprite(tile.resource, tile.token, tile.robber);
      tokenSprite.position.set(tile.x, TILE_HEIGHT + 0.72, tile.y);
      group.add(tokenSprite);

      if (!robberTileIds.has(tile.id)) {
        continue;
      }

      const marker = createTileFocusMarker(tile, verticesById, false);
      marker.position.set(tile.x, TILE_HEIGHT + 0.52, tile.y);
      registerPulseVisual(marker, pulseObjectsRef.current, "soft", 1.08);
      group.add(marker);

      const base = staticTileObjectsRef.current.get(tile.id);
      if (!base) {
        continue;
      }

      attachInteractiveMeta(base, "tile", tile.id, 1.06, marker);
      dynamicStaticInteractiveRef.current.push(base);
      dynamicInteractiveRef.current.push(base);
    }

    for (const edge of props.snapshot.board.edges) {
      const [leftId, rightId] = edge.vertexIds;
      const left = verticesById.get(leftId)!;
      const right = verticesById.get(rightId)!;
      const dx = right.x - left.x;
      const dz = right.y - left.y;
      const length = Math.sqrt(dx * dx + dz * dz);
      const centerX = (left.x + right.x) / 2;
      const centerZ = (left.y + right.y) / 2;

      const active = legalEdges.has(edge.id);
      const selected = selectedRoadEdges.has(edge.id);
      if (!edge.ownerId && !active && !selected) {
        continue;
      }

      const road = edge.ownerId
        ? createRoadPiece(length, colorToHex(edge.color ?? "red"), selected)
        : createRoadGuide(length, selected);
      const roadHeight = edge.ownerId ? TILE_HEIGHT + BUILT_ROAD_RADIUS + 0.04 : TILE_HEIGHT + GUIDE_ROAD_RADIUS;
      const roadObject = new THREE.Group();
      roadObject.position.set(centerX, roadHeight, centerZ);
      roadObject.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, 0, dz).normalize()
      );
      road.position.y = 0;
      road.castShadow = !!edge.ownerId;
      road.receiveShadow = false;
      roadObject.add(road);

      if (active) {
        const hitArea = createRoadHitArea(length);
        hitArea.position.y = 0;
        roadObject.add(hitArea);
      }

      group.add(roadObject);

      if (active) {
        registerPulseVisual(roadObject, pulseObjectsRef.current, selected ? "strong" : "soft", selected ? 1.24 : 1.18);
        attachInteractiveMeta(roadObject, "edge", edge.id, selected ? 1.18 : 1.14);
        dynamicInteractiveRef.current.push(roadObject);
      }
    }

    for (const vertex of props.snapshot.board.vertices) {
      const active = legalVertices.has(vertex.id);
      const building = vertex.building;
      if (!building && !active) {
        continue;
      }

      const mesh = building ? createBuildingMesh(building.type, building.color) : createVertexMarker();
      mesh.position.set(vertex.x, building ? TILE_HEIGHT + 0.02 : TILE_HEIGHT + 0.08, vertex.y);
      if (building) {
        mesh.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
      } else if (mesh instanceof THREE.Mesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
      group.add(mesh);

      if (active) {
        const marker = building ? createVertexFocusMarker(false) : null;
        if (marker) {
          marker.position.set(vertex.x, TILE_HEIGHT + 0.42, vertex.y);
          registerPulseVisual(marker, pulseObjectsRef.current, "soft", 1.1);
          group.add(marker);
        } else {
          registerPulseVisual(mesh, pulseObjectsRef.current, "soft", 1.1);
        }

        attachInteractiveMeta(mesh, "vertex", vertex.id, building ? 1.1 : 1.18, marker);
        dynamicInteractiveRef.current.push(mesh);
      }
    }

    if (props.focusCue) {
      appendFocusMarkers(group, props.snapshot, verticesById, props.focusCue, pulseObjectsRef.current);
    }

    interactiveRef.current = [...staticInteractiveRef.current, ...dynamicInteractiveRef.current];
  }, [boardStructureKey, props.focusCue, props.interactionMode, props.selectedRoadEdges, props.snapshot]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    if (!props.cameraCue) {
      autoFlightRef.current = false;
      return;
    }

    if (lastFocusKeyRef.current === props.cameraCue.key) {
      return;
    }

    lastFocusKeyRef.current = props.cameraCue.key;

    const nextFocus = resolveFocusCuePosition(props.snapshot, props.cameraCue);
    const currentDirection = camera.position.clone().sub(controls.target);
    const direction = currentDirection.lengthSq() > 0.01 ? currentDirection.normalize() : DEFAULT_CAMERA_POSITION.clone().normalize();
    const baseDistance = props.cameraCue.scale === "tight" ? 24 : props.cameraCue.scale === "medium" ? 31 : 39;
    const fitDistance =
      nextFocus.span > 0.01
        ? nextFocus.span * (props.cameraCue.scale === "tight" ? 1.6 : props.cameraCue.scale === "medium" ? 1.5 : 1.4) + 12
        : baseDistance;
    const distance = Math.max(baseDistance, fitDistance);
    const target = new THREE.Vector3(nextFocus.x, TILE_HEIGHT * 0.45, nextFocus.z);
    const nextCameraPosition = target.clone().add(direction.multiplyScalar(distance));
    nextCameraPosition.y = Math.max(nextCameraPosition.y, props.cameraCue.scale === "tight" ? 18 : 24);

    focusTargetRef.current.copy(target);
    focusCameraPositionRef.current.copy(nextCameraPosition);
    autoFlightRef.current = true;
  }, [props.cameraCue, props.snapshot]);

  return (
    <div className="board-canvas" ref={mountRef}>
      {boardTooltip ? (
        <div
          className="board-canvas-tooltip"
          style={
            {
              insetInlineStart: `${boardTooltip.x}px`,
              insetBlockStart: `${boardTooltip.y}px`,
              "--board-tooltip-accent": boardTooltip.accentColor
            } as CSSProperties
          }
        >
          <div className="board-canvas-tooltip-head">
            <span className="board-canvas-tooltip-dot" aria-hidden="true" />
            <strong>{boardTooltip.title}</strong>
          </div>
          <span>{boardTooltip.detail}</span>
        </div>
      ) : null}
    </div>
  );
}

function createBuildingMesh(type: "settlement" | "city", color: string): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color: colorToHex(color),
    roughness: 0.64,
    metalness: 0.08
  });

  if (type === "city") {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 1.35), material);
    base.position.y = 0.45;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.9), material);
    hall.position.set(-0.28, 1.02, 0);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.7, 0.62), material);
    tower.position.set(0.38, 1.12, 0);
    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.54, 0.7, 4), material);
    towerRoof.position.set(0.38, 2.25, 0);
    towerRoof.rotation.y = Math.PI / 4;
    group.add(base, hall, tower, towerRoof);
    return group;
  }

  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.82, 1.02), material);
  body.position.y = 0.41;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.86, 0.7, 4), material);
  roof.position.y = 1.15;
  roof.rotation.y = Math.PI / 4;
  group.add(body, roof);
  return group;
}

function createVertexMarker(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.6, 0.16, 12),
    new THREE.MeshStandardMaterial({
      color: "#f3cf83",
      roughness: 0.5,
      metalness: 0.08,
      transparent: true,
      opacity: 0.9,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: 0.22
    })
  );
}

function createTokenSprite(resource: Resource | "desert", token: number | null, robber: boolean): THREE.Sprite {
  const spriteResolution = 288;
  const center = spriteResolution / 2;
  const canvas = document.createElement("canvas");
  canvas.width = spriteResolution;
  canvas.height = spriteResolution;
  const context = canvas.getContext("2d")!;
  const resourceBadgeFill = robber ? "#0f1a24" : "#162633";
  const resourceBadgeStroke = robber ? "#f3cf83" : "rgba(240, 226, 190, 0.34)";
  const resourceIconColor = robber ? "#f3cf83" : getResourceIconColor(resource);

  context.fillStyle = robber ? "#17212b" : "#f4edd8";
  context.beginPath();
  context.arc(center, center, 87, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 10.5;
  context.strokeStyle = robber ? "#f3cf83" : "#6b4a1b";
  context.stroke();

  context.beginPath();
  context.fillStyle = resourceBadgeFill;
  context.arc(center, 69, 36, 0, Math.PI * 2);
  context.shadowColor = "rgba(5, 10, 15, 0.34)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 2;
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 5;
  context.strokeStyle = resourceBadgeStroke;
  context.stroke();
  drawResourceIcon(context, resource, center, 69, 42, resourceIconColor);

  if (token !== null) {
    context.fillStyle = token === 6 || token === 8 ? "#b83e2f" : "#203240";
    context.font = "700 92px 'Segoe UI Variable', 'Trebuchet MS', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(token), center, 156);
  } else {
    context.fillStyle = "#f3cf83";
    context.font = "700 36px 'Segoe UI Variable', 'Trebuchet MS', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("RÄUBER", center, 156);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
  );
  sprite.center.set(0.5, 0.38);
  sprite.scale.set(5.35, 5.35, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function createModernTileMesh(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  active: boolean,
  options: TileDecorationOptions = {
    includeProps: false,
    includeTerrainRelief: false
  }
): THREE.Group {
  const tileTopColor = TILE_COLORS[tile.resource];
  const tileSideColor = getTileOuterSideColor(tile.resource);
  const tileInsetTopColor = shadeColor(TILE_COLORS[tile.resource], 0.04);
  const tileInsetSideColor = shadeColor(TILE_COLORS[tile.resource], -0.04);
  const outerShape = createTileShape(tile, verticesById);
  const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.24,
    bevelThickness: 0.12,
    curveSegments: 6
  });
  outerGeometry.rotateX(-Math.PI / 2);

  const insetDepth = 0.26;
  const insetShape = createTileShape(tile, verticesById, 0.962);
  const insetGeometry = new THREE.ExtrudeGeometry(insetShape, {
    depth: insetDepth,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.05,
    curveSegments: 6
  });
  insetGeometry.rotateX(-Math.PI / 2);

  const outerMesh = markTileShadowReceiver(new THREE.Mesh(
    outerGeometry,
    [
      new THREE.MeshStandardMaterial({
        color: tileTopColor,
          roughness: 0.92,
          metalness: 0.01
        }),
        new THREE.MeshStandardMaterial({
          color: tileSideColor,
          roughness: 0.98,
          metalness: 0.01
        })
    ]
  ));

  const insetMesh = markTileShadowReceiver(new THREE.Mesh(
    insetGeometry,
    [
      new THREE.MeshStandardMaterial({
        color: tileInsetTopColor,
          roughness: 0.86,
          metalness: 0.02,
          emissive: active ? new THREE.Color("#f2c56b") : new THREE.Color("#000000"),
          emissiveIntensity: active ? 0.16 : 0
        }),
        new THREE.MeshStandardMaterial({
          color: tileInsetSideColor,
          roughness: 0.94,
          metalness: 0.01
        })
    ]
  ));
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh);
  tileGroup.add(insetMesh);
  appendTileDecorations(tileGroup, tile, active, options);
  return tileGroup;
}

function createTexturedTileMesh(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  active: boolean,
  terrainBundle: UltraTerrainTextureBundle,
  options: TexturedTileOptions
): THREE.Group {
  const outerShape = createTileShape(tile, verticesById);
  const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.24,
    bevelThickness: 0.12,
    curveSegments: 6
  });
  outerGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(outerGeometry);

  const insetDepth = 0.26;
  const insetShape = createTileShape(tile, verticesById, 0.962);
  const insetGeometry = new THREE.ExtrudeGeometry(insetShape, {
    depth: insetDepth,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.05,
    curveSegments: 6
  });
  insetGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(insetGeometry);

  const outerMesh = markTileShadowReceiver(new THREE.Mesh(outerGeometry, [
    new THREE.MeshPhysicalMaterial({
      color: terrainBundle.appearance.topTint,
      map: terrainBundle.colorMap,
      roughnessMap: terrainBundle.roughnessMap,
      bumpMap: terrainBundle.bumpMap,
      roughness: terrainBundle.appearance.roughness,
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale * 0.82,
      clearcoat: terrainBundle.appearance.clearcoat,
      clearcoatRoughness: terrainBundle.appearance.clearcoatRoughness,
      emissive: new THREE.Color(active ? "#f0cb7a" : terrainBundle.appearance.emissive),
      emissiveIntensity: active ? 0.12 : 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: terrainBundle.appearance.sideTint,
      roughness: 0.96,
      metalness: 0.02
    })
  ]));

  const insetMesh = markTileShadowReceiver(new THREE.Mesh(insetGeometry, [
    new THREE.MeshPhysicalMaterial({
      color: terrainBundle.appearance.insetTint,
      map: terrainBundle.colorMap,
      roughnessMap: terrainBundle.roughnessMap,
      bumpMap: terrainBundle.bumpMap,
      roughness: Math.max(terrainBundle.appearance.roughness - 0.05, 0.36),
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale,
      clearcoat: terrainBundle.appearance.clearcoat,
      clearcoatRoughness: Math.max(terrainBundle.appearance.clearcoatRoughness - 0.08, 0.2),
      emissive: new THREE.Color(active ? "#f4d990" : terrainBundle.appearance.emissive),
      emissiveIntensity: active ? 0.14 : 0.028
    }),
    new THREE.MeshStandardMaterial({
      color: terrainBundle.appearance.insetSideTint,
      roughness: 0.94,
      metalness: 0.01
    })
  ]));
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const overlayGeometry = new THREE.ShapeGeometry(createTileShape(tile, verticesById, 0.932));
  overlayGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(overlayGeometry);
  const overlayMaterial = createUltraTileOverlayMaterial(
    terrainBundle,
    active,
    options.reducedMotion,
    options.animateOverlay
  );
  if (options.animateOverlay) {
    options.animatedMaterials.push(overlayMaterial);
  }
  const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
  overlay.position.y = TILE_HEIGHT + 0.03;
  overlay.renderOrder = 4;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh, insetMesh, overlay);
  appendTileDecorations(tileGroup, tile, active, options);
  return tileGroup;
}

function appendTileDecorations(
  tileGroup: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  options: TileDecorationOptions
): void {
  if (options.includeTerrainRelief) {
    const reliefMode: Exclude<UltraTileReliefMode, "none"> = options.includeProps ? "full" : "terrain";
    const reliefGroup = createUltraTerrainRelief(tile, active, reliefMode);
    reliefGroup.position.y = TILE_HEIGHT + 0.006;
    tileGroup.add(reliefGroup);
  }

  if (!options.includeProps) {
    return;
  }

  const propGroup = createLandingFancyTileProps(tile.resource);
  nudgeFancyPropsAwayFromTileCenter(propGroup);
  propGroup.position.y = TILE_HEIGHT + 0.03;
  propGroup.traverse((entry) => {
    entry.userData.castTileShadow = true;
  });
  tileGroup.add(propGroup);
}

function nudgeFancyPropsAwayFromTileCenter(group: THREE.Group): void {
  for (const child of group.children) {
    const length = Math.hypot(child.position.x, child.position.z);
    if (length < 0.04) {
      continue;
    }

    const offsetScale = 1.08;
    const extraOffset = 0.12;
    const nextLength = length * offsetScale + extraOffset;
    child.position.x = (child.position.x / length) * nextLength;
    child.position.z = (child.position.z / length) * nextLength;
  }
}

function createUltraTileMesh(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  active: boolean,
  terrainBundle: UltraTerrainTextureBundle,
  animatedMaterials: UltraTileOverlayMaterial[],
  reducedMotion: boolean,
  animateOverlay: boolean,
  reliefMode: UltraTileReliefMode
): THREE.Group {
  const outerShape = createTileShape(tile, verticesById);
  const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.22,
    bevelThickness: 0.12,
    curveSegments: 8
  });
  outerGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(outerGeometry);

  const insetDepth = 0.28;
  const insetShape = createTileShape(tile, verticesById, 0.956);
  const insetGeometry = new THREE.ExtrudeGeometry(insetShape, {
    depth: insetDepth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.045,
    curveSegments: 8
  });
  insetGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(insetGeometry);

  const outerMesh = markTileShadowReceiver(new THREE.Mesh(outerGeometry, [
    new THREE.MeshPhysicalMaterial({
      color: terrainBundle.appearance.topTint,
      map: terrainBundle.colorMap,
      roughnessMap: terrainBundle.roughnessMap,
      bumpMap: terrainBundle.bumpMap,
      roughness: terrainBundle.appearance.roughness,
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale,
      clearcoat: terrainBundle.appearance.clearcoat,
      clearcoatRoughness: terrainBundle.appearance.clearcoatRoughness,
      emissive: new THREE.Color(active ? "#f0cb7a" : terrainBundle.appearance.emissive),
      emissiveIntensity: active ? 0.24 : 0.08
    }),
    new THREE.MeshStandardMaterial({
      color: terrainBundle.appearance.sideTint,
      roughness: 0.96,
      metalness: 0.02
    })
  ]));

  const insetMesh = markTileShadowReceiver(new THREE.Mesh(insetGeometry, [
    new THREE.MeshPhysicalMaterial({
      color: terrainBundle.appearance.insetTint,
      map: terrainBundle.colorMap,
      roughnessMap: terrainBundle.roughnessMap,
      bumpMap: terrainBundle.bumpMap,
      roughness: Math.max(terrainBundle.appearance.roughness - 0.06, 0.18),
      metalness: terrainBundle.appearance.metalness,
      bumpScale: terrainBundle.appearance.bumpScale * 0.86,
      clearcoat: terrainBundle.appearance.clearcoat,
      clearcoatRoughness: terrainBundle.appearance.clearcoatRoughness,
      emissive: new THREE.Color(active ? "#f4d990" : terrainBundle.appearance.emissive),
      emissiveIntensity: active ? 0.3 : 0.1
    }),
    new THREE.MeshStandardMaterial({
      color: terrainBundle.appearance.insetSideTint,
      roughness: 0.92,
      metalness: 0.02
    })
  ]));
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const overlayShape = createTileShape(tile, verticesById, 0.928);
  const overlayGeometry = new THREE.ShapeGeometry(overlayShape, 12);
  overlayGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(overlayGeometry);
  const overlayMaterial = createUltraTileOverlayMaterial(terrainBundle, active, reducedMotion, animateOverlay);
  if (animateOverlay) {
    animatedMaterials.push(overlayMaterial);
  }
  const overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
  overlayMesh.position.y = TILE_HEIGHT + 0.028;
  overlayMesh.renderOrder = 4;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh);
  tileGroup.add(insetMesh);
  if (reliefMode !== "none") {
    const reliefGroup = createUltraTerrainRelief(tile, active, reliefMode);
    reliefGroup.position.y = TILE_HEIGHT + 0.006;
    tileGroup.add(reliefGroup);
  }
  tileGroup.add(overlayMesh);
  return tileGroup;
}

function createUltraTerrainRelief(
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): THREE.Group {
  const group = new THREE.Group();

  switch (tile.resource) {
    case "lumber":
      buildLumberRelief(group, tile, active, reliefMode);
      break;
    case "ore":
      buildOreRelief(group, tile, active, reliefMode);
      break;
    case "grain":
      buildGrainRelief(group, tile, active, reliefMode);
      break;
    case "brick":
      buildBrickRelief(group, tile, active, reliefMode);
      break;
    case "wool":
      buildWoolRelief(group, tile, active, reliefMode);
      break;
    case "desert":
      buildDesertRelief(group, tile, active, reliefMode);
      break;
  }

  return group;
}

function buildLumberRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.62);
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 7, 1.88, 3.26, 0.82, 1.2, "forest-main", {
      occupied,
      minGap: 0.42,
      footprintScale: 0.94,
      radialBias: 0.66,
      stretchZ: 0.94,
      candidatesPerAnchor: 16
    });
    for (const [index, anchor] of anchors.entries()) {
      const cluster = createTreeCluster(anchor.scale, active, index % 2 === 0);
      cluster.position.set(anchor.x, 0, anchor.z);
      cluster.rotation.y = anchor.angle;
      group.add(cluster);
    }

    const accentAnchors = createReliefAnchors(
      tile,
      12,
      1.42,
      3.18,
      0.42 * accentScaleBoost,
      0.78 * accentScaleBoost,
      "forest-accent",
      {
        occupied,
        minGap: 0.24,
        footprintScale: 0.58,
        radialBias: 0.84,
        stretchZ: 0.94,
        candidatesPerAnchor: 14
      }
    );
    for (const [index, anchor] of accentAnchors.entries()) {
      const accent = applyReliefPropPresentation(createForestAccent(anchor.scale, active, index % 3 === 0), reliefMode, "accent");
      accent.position.set(anchor.x, 0, anchor.z);
      accent.rotation.y = anchor.angle;
      group.add(accent);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 14 : 10,
    reliefMode === "full" ? 1.18 : 1.26,
    reliefMode === "full" ? 3.18 : 3.04,
    (reliefMode === "full" ? 0.24 : 0.28) * detailScaleBoost,
    (reliefMode === "full" ? 0.5 : 0.58) * detailScaleBoost,
    reliefMode === "full" ? "forest-scatter" : "forest-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.14 : 0.16,
      footprintScale: reliefMode === "full" ? 0.32 : 0.36,
      radialBias: 0.92,
      stretchZ: 0.95,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = reliefMode === "full" ? (["fern", "log", "stones"] as const) : (["log", "stones", "fern"] as const);
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createForestGroundDetail(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle;
    group.add(detail);
  }
}

function buildOreRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.7);
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 6, 1.96, 3.18, 0.94, 1.36, "ore-main", {
      occupied,
      minGap: 0.5,
      footprintScale: 0.98,
      radialBias: 0.62,
      stretchZ: 0.94,
      candidatesPerAnchor: 18
    });
    for (const [index, anchor] of anchors.entries()) {
      const cluster = createMountainCluster(anchor.scale * (index === 0 ? 1.18 : 1), active);
      cluster.scale.y = index === 0 ? 1.22 : index % 2 === 0 ? 1.14 : 1.06;
      cluster.position.set(anchor.x, 0, anchor.z);
      cluster.rotation.y = anchor.angle;
      group.add(cluster);
    }

    const accentAnchors = createReliefAnchors(tile, 9, 1.56, 3.12, 0.42 * accentScaleBoost, 0.84 * accentScaleBoost, "ore-accent", {
      occupied,
      minGap: 0.26,
      footprintScale: 0.6,
      radialBias: 0.78,
      stretchZ: 0.94,
      candidatesPerAnchor: 14
    });
    for (const [index, anchor] of accentAnchors.entries()) {
      const accent = applyReliefPropPresentation(createOreOutcrop(anchor.scale, active, index % 2 === 0), reliefMode, "accent");
      accent.position.set(anchor.x, 0, anchor.z);
      accent.rotation.y = anchor.angle;
      group.add(accent);
    }

    const heroAnchors = createReliefAnchors(tile, 2, 2.24, 2.88, 1.18, 1.44, "ore-hero", {
      occupied,
      minGap: 0.62,
      footprintScale: 1.08,
      radialBias: 0.7,
      stretchZ: 0.94,
      candidatesPerAnchor: 20
    });
    for (const [index, anchor] of heroAnchors.entries()) {
      const massif = createMountainCluster(anchor.scale, active);
      massif.scale.y = index === 0 ? 1.32 : 1.2;
      massif.position.set(anchor.x, 0, anchor.z);
      massif.rotation.y = anchor.angle;
      group.add(massif);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 12 : 8,
    reliefMode === "full" ? 1.42 : 1.5,
    reliefMode === "full" ? 3.04 : 2.96,
    (reliefMode === "full" ? 0.26 : 0.32) * detailScaleBoost,
    (reliefMode === "full" ? 0.52 : 0.62) * detailScaleBoost,
    reliefMode === "full" ? "ore-scatter" : "ore-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.16 : 0.18,
      footprintScale: reliefMode === "full" ? 0.34 : 0.38,
      radialBias: 0.88,
      stretchZ: 0.95,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = reliefMode === "full" ? (["rubble", "crystal", "ledge"] as const) : (["crystal", "rubble", "crystal"] as const);
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createOreScatter(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle;
    group.add(detail);
  }
}

function buildGrainRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.58);
  const heroScaleBoost = getReliefPropScaleBoost(reliefMode, "hero");
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 7, 1.72, 3.02, 0.82, 1.12, "grain-main", {
      occupied,
      minGap: 0.34,
      footprintScale: 0.74,
      radialBias: 0.74,
      stretchZ: 0.95,
      candidatesPerAnchor: 16
    });
    for (const [index, anchor] of anchors.entries()) {
      const patch = createWheatPatch(anchor.scale, active);
      patch.position.set(anchor.x, 0, anchor.z);
      patch.rotation.y = anchor.angle + Math.PI / 2 + (index % 2 === 0 ? 0.12 : -0.08);
      group.add(patch);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const heroAnchors = createReliefAnchors(tile, 2, 2.02, 2.78, 0.68 * heroScaleBoost, 0.88 * heroScaleBoost, "grain-hero", {
    occupied,
    minGap: 0.42,
    footprintScale: 0.84,
    radialBias: 0.8,
    stretchZ: 0.95,
    candidatesPerAnchor: 18
  });
  const heroVariants = ["barn", "scarecrow"] as const;
  for (const [index, anchor] of heroAnchors.entries()) {
    const feature = applyReliefPropPresentation(
      createFarmsteadFeature(anchor.scale, active, getCyclicVariant(heroVariants, index)),
      reliefMode,
      "hero"
    );
    feature.position.set(anchor.x, 0, anchor.z);
    feature.rotation.y = anchor.angle + Math.PI * 0.75;
    group.add(feature);
  }

  const accentAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 8 : 6,
    1.54,
    3.04,
    0.4 * accentScaleBoost,
    0.78 * accentScaleBoost,
    reliefMode === "full" ? "grain-accent" : "grain-fancy",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.22 : 0.24,
      footprintScale: reliefMode === "full" ? 0.5 : 0.54,
      radialBias: 0.86,
      stretchZ: 0.95,
      candidatesPerAnchor: 14
    }
  );
  for (const [index, anchor] of accentAnchors.entries()) {
    const accent = applyReliefPropPresentation(createHayFeature(anchor.scale, active, index % 2 === 0), reliefMode, "accent");
    accent.position.set(anchor.x, 0, anchor.z);
    accent.rotation.y = anchor.angle;
    group.add(accent);
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 14 : 8,
    reliefMode === "full" ? 1.28 : 1.34,
    reliefMode === "full" ? 3.1 : 2.9,
    0.24 * detailScaleBoost,
    (reliefMode === "full" ? 0.46 : 0.54) * detailScaleBoost,
    reliefMode === "full" ? "grain-scatter" : "grain-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.14 : 0.16,
      footprintScale: reliefMode === "full" ? 0.3 : 0.34,
      radialBias: 0.94,
      stretchZ: 0.96,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = reliefMode === "full" ? (["furrow", "tuft", "stook"] as const) : (["stook", "tuft", "stook"] as const);
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createFieldDetail(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle + Math.PI / 2;
    group.add(detail);
  }
}

function buildBrickRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.6);
  const heroScaleBoost = getReliefPropScaleBoost(reliefMode, "hero");
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 7, 1.8, 3.08, 0.84, 1.12, "brick-main", {
      occupied,
      minGap: 0.36,
      footprintScale: 0.8,
      radialBias: 0.72,
      stretchZ: 0.94,
      candidatesPerAnchor: 16
    });
    for (const [index, anchor] of anchors.entries()) {
      const mesa = createClayMesa(anchor.scale * (index % 2 === 0 ? 1.08 : 0.92), active);
      mesa.position.set(anchor.x, 0, anchor.z);
      mesa.rotation.y = anchor.angle;
      group.add(mesa);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const heroAnchors = createReliefAnchors(tile, 2, 2.0, 2.74, 0.62 * heroScaleBoost, 0.84 * heroScaleBoost, "brick-hero", {
    occupied,
    minGap: 0.4,
    footprintScale: 0.82,
    radialBias: 0.8,
    stretchZ: 0.94,
    candidatesPerAnchor: 18
  });
  const heroVariants = ["kiln", "stack"] as const;
  for (const [index, anchor] of heroAnchors.entries()) {
    const feature = applyReliefPropPresentation(
      createClayIndustryFeature(anchor.scale, active, getCyclicVariant(heroVariants, index)),
      reliefMode,
      "hero"
    );
    feature.position.set(anchor.x, 0, anchor.z);
    feature.rotation.y = anchor.angle;
    group.add(feature);
  }

  const accentAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 8 : 6,
    1.52,
    3.06,
    0.42 * accentScaleBoost,
    0.8 * accentScaleBoost,
    reliefMode === "full" ? "brick-accent" : "brick-fancy",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.22 : 0.24,
      footprintScale: reliefMode === "full" ? 0.5 : 0.54,
      radialBias: 0.86,
      stretchZ: 0.95,
      candidatesPerAnchor: 14
    }
  );
  for (const [index, anchor] of accentAnchors.entries()) {
    const accent = applyReliefPropPresentation(createClayAccent(anchor.scale, active, index % 2 === 0), reliefMode, "accent");
    accent.position.set(anchor.x, 0, anchor.z);
    accent.rotation.y = anchor.angle;
    group.add(accent);
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 13 : 8,
    reliefMode === "full" ? 1.26 : 1.34,
    reliefMode === "full" ? 3.08 : 2.88,
    0.24 * detailScaleBoost,
    (reliefMode === "full" ? 0.46 : 0.54) * detailScaleBoost,
    reliefMode === "full" ? "brick-scatter" : "brick-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.14 : 0.16,
      footprintScale: reliefMode === "full" ? 0.32 : 0.36,
      radialBias: 0.92,
      stretchZ: 0.95,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = reliefMode === "full" ? (["rubble", "cut", "pit"] as const) : (["cut", "rubble", "cut"] as const);
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createClayScatter(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle;
    group.add(detail);
  }
}

function buildWoolRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.58);
  const heroScaleBoost = getReliefPropScaleBoost(reliefMode, "hero");
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 8, 1.82, 3.12, 0.86, 1.16, "wool-main", {
      occupied,
      minGap: 0.36,
      footprintScale: 0.82,
      radialBias: 0.72,
      stretchZ: 0.95,
      candidatesPerAnchor: 16
    });
    for (const [index, anchor] of anchors.entries()) {
      const tuft = createPastureTuft(anchor.scale, active);
      tuft.position.set(anchor.x, 0, anchor.z);
      tuft.rotation.y = anchor.angle + (index % 2 === 0 ? 0.12 : -0.08);
      group.add(tuft);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const heroAnchors = createReliefAnchors(tile, 2, 1.92, 2.62, 0.72 * heroScaleBoost, 0.94 * heroScaleBoost, "wool-hero", {
    occupied,
    minGap: 0.42,
    footprintScale: 0.88,
    radialBias: 0.82,
    stretchZ: 0.95,
    candidatesPerAnchor: 18
  });
  for (const anchor of heroAnchors) {
    const feature = applyReliefPropPresentation(createSheepfoldFeature(anchor.scale, active), reliefMode, "hero");
    feature.position.set(anchor.x, 0, anchor.z);
    feature.rotation.y = anchor.angle;
    group.add(feature);
  }

  const accentAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 10 : 8,
    1.52,
    3.08,
    0.42 * accentScaleBoost,
    0.78 * accentScaleBoost,
    reliefMode === "full" ? "wool-accent" : "wool-fancy",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.22 : 0.24,
      footprintScale: reliefMode === "full" ? 0.5 : 0.54,
      radialBias: 0.88,
      stretchZ: 0.96,
      candidatesPerAnchor: 14
    }
  );
  const accentVariants = ["fence", "lamb", "shrub", "trough", "flowers"] as const;
  for (const [index, anchor] of accentAnchors.entries()) {
    const accent = applyReliefPropPresentation(
      createPastureAccent(anchor.scale, active, getCyclicVariant(accentVariants, index)),
      reliefMode,
      "accent"
    );
    accent.position.set(anchor.x, 0, anchor.z);
    accent.rotation.y = anchor.angle;
    group.add(accent);
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 14 : 10,
    reliefMode === "full" ? 1.22 : 1.3,
    reliefMode === "full" ? 3.06 : 2.88,
    0.24 * detailScaleBoost,
    (reliefMode === "full" ? 0.42 : 0.5) * detailScaleBoost,
    reliefMode === "full" ? "wool-scatter" : "wool-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.14 : 0.16,
      footprintScale: reliefMode === "full" ? 0.3 : 0.34,
      radialBias: 0.94,
      stretchZ: 0.96,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = ["flowers", "trough", "shrub"] as const;
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createPastureGroundDetail(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle;
    group.add(detail);
  }
}

function buildDesertRelief(
  group: THREE.Group,
  tile: MatchSnapshot["board"]["tiles"][number],
  active: boolean,
  reliefMode: Exclude<UltraTileReliefMode, "none">
): void {
  const occupied = createReliefOccupancy(1.62);
  const heroScaleBoost = getReliefPropScaleBoost(reliefMode, "hero");
  const accentScaleBoost = getReliefPropScaleBoost(reliefMode, "accent");
  const detailScaleBoost = getReliefPropScaleBoost(reliefMode, "detail");
  if (reliefMode === "full" || reliefMode === "terrain") {
    const anchors = createReliefAnchors(tile, 7, 1.84, 3.08, 0.9, 1.18, "desert-main", {
      occupied,
      minGap: 0.38,
      footprintScale: 0.84,
      radialBias: 0.72,
      stretchZ: 0.94,
      candidatesPerAnchor: 16
    });
    for (const [index, anchor] of anchors.entries()) {
      const dune = createDuneCluster(anchor.scale * (index === 0 ? 1.14 : 0.96), active, index % 2 === 0);
      dune.position.set(anchor.x, 0, anchor.z);
      dune.rotation.y = anchor.angle;
      group.add(dune);
    }
  }

  if (reliefMode === "terrain") {
    return;
  }

  const heroAnchors = createReliefAnchors(tile, 2, 1.98, 2.74, 0.64 * heroScaleBoost, 0.88 * heroScaleBoost, "desert-hero", {
    occupied,
    minGap: 0.42,
    footprintScale: 0.84,
    radialBias: 0.8,
    stretchZ: 0.94,
    candidatesPerAnchor: 18
  });
  for (const [index, anchor] of heroAnchors.entries()) {
    const cactus = applyReliefPropPresentation(createCactusCluster(anchor.scale, active, index % 2 === 0), reliefMode, "hero");
    cactus.position.set(anchor.x, 0, anchor.z);
    cactus.rotation.y = anchor.angle;
    group.add(cactus);
  }

  const accentAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 8 : 6,
    1.54,
    3.08,
    0.42 * accentScaleBoost,
    0.8 * accentScaleBoost,
    reliefMode === "full" ? "desert-accent" : "desert-fancy",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.22 : 0.24,
      footprintScale: reliefMode === "full" ? 0.5 : 0.54,
      radialBias: 0.86,
      stretchZ: 0.95,
      candidatesPerAnchor: 14
    }
  );
  for (const [index, anchor] of accentAnchors.entries()) {
    const accent = applyReliefPropPresentation(createDesertAccent(anchor.scale, active, index % 2 === 0), reliefMode, "accent");
    accent.position.set(anchor.x, 0, anchor.z);
    accent.rotation.y = anchor.angle;
    group.add(accent);
  }

  const fillAnchors = createReliefAnchors(
    tile,
    reliefMode === "full" ? 13 : 8,
    reliefMode === "full" ? 1.24 : 1.34,
    reliefMode === "full" ? 3.04 : 2.88,
    0.24 * detailScaleBoost,
    (reliefMode === "full" ? 0.44 : 0.52) * detailScaleBoost,
    reliefMode === "full" ? "desert-scatter" : "desert-props",
    {
      occupied,
      minGap: reliefMode === "full" ? 0.14 : 0.16,
      footprintScale: reliefMode === "full" ? 0.32 : 0.36,
      radialBias: 0.92,
      stretchZ: 0.95,
      candidatesPerAnchor: 12
    }
  );
  const fillVariants = reliefMode === "full" ? (["ripple", "scrub", "bones"] as const) : (["scrub", "bones", "scrub"] as const);
  for (const [index, anchor] of fillAnchors.entries()) {
    const detail = applyReliefPropPresentation(
      createDesertScatter(anchor.scale, active, getCyclicVariant(fillVariants, index)),
      reliefMode,
      "detail"
    );
    detail.position.set(anchor.x, 0, anchor.z);
    detail.rotation.y = anchor.angle;
    group.add(detail);
  }
}

function createTreeCluster(scale: number, active: boolean, dense: boolean): THREE.Group {
  const group = new THREE.Group();
  const forestFloorMaterial = new THREE.MeshStandardMaterial({
    color: dense ? "#355629" : "#446536",
    roughness: 0.94,
    metalness: 0.01
  });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: dense ? "#2d6a2f" : "#3a7d39",
    roughness: 0.84,
    metalness: 0.02,
    emissive: new THREE.Color(active ? "#d7f29a" : "#112713"),
    emissiveIntensity: active ? 0.14 : 0.04
  });
  const canopyHighlightMaterial = new THREE.MeshStandardMaterial({
    color: dense ? "#4b8c44" : "#66a657",
    roughness: 0.78,
    metalness: 0.02
  });
  const broadleafMaterial = new THREE.MeshStandardMaterial({
    color: dense ? "#3f6f31" : "#5b8d47",
    roughness: 0.82,
    metalness: 0.02,
    emissive: new THREE.Color(active ? "#d9f4a8" : "#122513"),
    emissiveIntensity: active ? 0.12 : 0.03
  });
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#5a3e22",
    roughness: 0.92,
    metalness: 0.01
  });
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: dense ? "#527f3f" : "#6a9b52",
    roughness: 0.9,
    metalness: 0.01
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#59635d",
    roughness: 0.96,
    metalness: 0.02
  });

  const floor = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 0.96 * scale, 0.08 * scale, 7), forestFloorMaterial)
  );
  floor.position.y = 0.04 * scale;
  group.add(floor);

  const offsets = [
    { x: -0.04, z: 0.06, s: 1.04 },
    { x: 0.4, z: -0.26, s: 0.86 },
    { x: -0.4, z: 0.22, s: 0.8 },
    { x: 0.24, z: 0.36, s: 0.7 },
    { x: -0.18, z: -0.32, s: 0.64 },
    { x: 0.06, z: -0.06, s: 0.56 }
  ] as const;

  for (const [index, entry] of offsets.entries()) {
    const treeScale = scale * entry.s;
    const trunk = markTileShadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.055 * treeScale, 0.08 * treeScale, 0.34 * treeScale, 6),
        trunkMaterial
      )
    );
    trunk.position.set(entry.x * scale, 0.17 * treeScale, entry.z * scale);

    const variant = dense ? index % 3 : (index + 1) % 3;
    if (variant === 0) {
      const canopy = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.28 * treeScale, 0.56 * treeScale, 7), canopyMaterial)
      );
      canopy.position.set(entry.x * scale, 0.5 * treeScale, entry.z * scale);

      const cap = markTileShadow(
        new THREE.Mesh(new THREE.SphereGeometry(0.2 * treeScale, 10, 8), canopyHighlightMaterial)
      );
      cap.position.set(entry.x * scale, 0.7 * treeScale, entry.z * scale);
      cap.scale.set(1.15, 0.84, 1.05);

      const underCanopy = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.2 * treeScale, 0.34 * treeScale, 6), canopyMaterial)
      );
      underCanopy.position.set(entry.x * scale, 0.32 * treeScale, entry.z * scale);

      group.add(trunk, canopy, cap, underCanopy);
    } else if (variant === 1) {
      const crownA = markTileShadow(
        new THREE.Mesh(new THREE.SphereGeometry(0.22 * treeScale, 10, 8), broadleafMaterial)
      );
      crownA.position.set(entry.x * scale, 0.44 * treeScale, entry.z * scale);
      crownA.scale.set(1.24, 0.94, 1.1);
      const crownB = markTileShadow(
        new THREE.Mesh(new THREE.SphereGeometry(0.18 * treeScale, 10, 8), canopyHighlightMaterial)
      );
      crownB.position.set((entry.x + 0.05) * scale, 0.58 * treeScale, (entry.z - 0.03) * scale);
      crownB.scale.set(1.08, 0.88, 1.12);
      const crownC = markTileShadow(
        new THREE.Mesh(new THREE.SphereGeometry(0.14 * treeScale, 8, 6), broadleafMaterial)
      );
      crownC.position.set((entry.x - 0.08) * scale, 0.54 * treeScale, (entry.z + 0.05) * scale);
      crownC.scale.set(1.02, 0.8, 1.04);
      group.add(trunk, crownA, crownB, crownC);
    } else {
      const lowCone = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.22 * treeScale, 0.3 * treeScale, 7), canopyMaterial)
      );
      lowCone.position.set(entry.x * scale, 0.28 * treeScale, entry.z * scale);
      const midCone = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.18 * treeScale, 0.28 * treeScale, 7), canopyHighlightMaterial)
      );
      midCone.position.set(entry.x * scale, 0.46 * treeScale, entry.z * scale);
      const topCone = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.12 * treeScale, 0.24 * treeScale, 6), canopyMaterial)
      );
      topCone.position.set(entry.x * scale, 0.64 * treeScale, entry.z * scale);
      group.add(trunk, lowCone, midCone, topCone);
    }
  }

  const shrubOffsets = [
    { x: -0.42, z: -0.24, s: 0.18 },
    { x: -0.18, z: 0.42, s: 0.14 },
    { x: 0.36, z: 0.16, s: 0.16 },
    { x: 0.48, z: -0.06, s: 0.12 },
    { x: -0.04, z: 0.48, s: 0.12 },
    { x: 0.14, z: -0.42, s: 0.1 }
  ] as const;
  for (const entry of shrubOffsets) {
    const shrub = markTileShadow(
      new THREE.Mesh(new THREE.SphereGeometry(entry.s * scale, 8, 6), shrubMaterial)
    );
    shrub.position.set(entry.x * scale, 0.12 * scale, entry.z * scale);
    shrub.scale.set(1.24, 0.76, 1);
    group.add(shrub);
  }

  const log = markTileShadow(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.05 * scale, 0.34 * scale, 4, 8), trunkMaterial)
  );
  log.position.set(-0.28 * scale, 0.09 * scale, -0.12 * scale);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = 0.36;

  const rock = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 * scale, 0), rockMaterial));
  rock.position.set(0.26 * scale, 0.08 * scale, -0.38 * scale);
  rock.rotation.set(0.18, 0.44, -0.14);

  group.add(log, rock);

  return group;
}

function createMountainCluster(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#6f7c8d",
    roughness: 0.9,
    metalness: 0.05,
    emissive: new THREE.Color(active ? "#bfd8ff" : "#1d2632"),
    emissiveIntensity: active ? 0.12 : 0.03
  });
  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color: "#95a2b6",
    roughness: 0.8,
    metalness: 0.04
  });
  const screeMaterial = new THREE.MeshStandardMaterial({
    color: "#5e6775",
    roughness: 0.96,
    metalness: 0.02
  });
  const oreMaterial = new THREE.MeshStandardMaterial({
    color: "#b9d7f6",
    roughness: 0.42,
    metalness: 0.08,
    emissive: new THREE.Color("#9fd2ff"),
    emissiveIntensity: active ? 0.2 : 0.08
  });

  const base = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.74 * scale, 0.94 * scale, 0.28 * scale, 6), ridgeMaterial)
  );
  base.position.y = 0.12 * scale;

  const ridgeShelf = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.12 * scale, 0.38 * scale), ridgeMaterial)
  );
  ridgeShelf.position.set(-0.02 * scale, 0.22 * scale, 0.16 * scale);
  ridgeShelf.rotation.set(0.1, 0.24, -0.04);

  const cliffWall = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.24 * scale, 0.22 * scale), rockMaterial)
  );
  cliffWall.position.set(-0.16 * scale, 0.28 * scale, -0.02 * scale);
  cliffWall.rotation.set(0.18, -0.16, -0.08);

  const peakOffsets = [
    { x: -0.18, z: 0.08, r: 0.34, h: 1.18, s: 1 },
    { x: 0.24, z: -0.14, r: 0.28, h: 0.9, s: 0.84 },
    { x: 0.12, z: 0.3, r: 0.24, h: 0.74, s: 0.7 },
    { x: -0.42, z: -0.22, r: 0.22, h: 0.62, s: 0.56 },
    { x: 0.36, z: 0.08, r: 0.18, h: 0.52, s: 0.46 }
  ] as const;
  for (const entry of peakOffsets) {
    const peak = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(entry.r * scale, entry.h * scale, 5), rockMaterial)
    );
    peak.position.set(entry.x * scale, 0.18 * scale + entry.h * scale * 0.5, entry.z * scale);
    peak.rotation.y = entry.s * 2.8;
    group.add(peak);
  }

  const backSpire = markTileShadow(
    new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.82 * scale, 4), ridgeMaterial)
  );
  backSpire.position.set(0.04 * scale, 0.54 * scale, -0.34 * scale);
  backSpire.rotation.y = 0.42;
  group.add(backSpire);

  const crystalOffsets = [
    { x: 0.24, z: 0.12, h: 0.34, s: 0.16 },
    { x: 0.02, z: -0.22, h: 0.28, s: 0.12 },
    { x: -0.12, z: 0.18, h: 0.24, s: 0.08 }
  ] as const;
  for (const entry of crystalOffsets) {
    const crystal = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.06 * scale, entry.h * scale, 6), oreMaterial)
    );
    crystal.position.set(entry.x * scale, 0.24 * scale, entry.z * scale);
    crystal.rotation.set(0.12, 0.18, 0.22);
    group.add(crystal);
  }

  const oreVein = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.1 * scale, 0.56 * scale), oreMaterial)
  );
  oreVein.position.set(0.1 * scale, 0.36 * scale, -0.02 * scale);
  oreVein.rotation.z = -0.34;
  oreVein.rotation.x = 0.22;

  const screeOffsets = [
    { x: -0.22, z: 0.34, s: 0.08 },
    { x: 0.38, z: 0.08, s: 0.09 },
    { x: -0.42, z: -0.08, s: 0.07 },
    { x: 0.12, z: -0.38, s: 0.08 },
    { x: -0.06, z: 0.42, s: 0.06 }
  ] as const;
  for (const entry of screeOffsets) {
    const rock = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), screeMaterial));
    rock.position.set(entry.x * scale, 0.06 * scale, entry.z * scale);
    rock.rotation.set(0.24, 0.36, -0.18);
    group.add(rock);
  }

  group.add(base, ridgeShelf, cliffWall, oreVein);
  return group;
}

function createWheatPatch(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const rowMaterial = new THREE.MeshStandardMaterial({
    color: "#ae8b3e",
    roughness: 0.88,
    metalness: 0.02
  });
  const stalkMaterial = new THREE.MeshStandardMaterial({
    color: "#e8c86c",
    roughness: 0.74,
    metalness: 0.02,
    emissive: new THREE.Color(active ? "#fff1ab" : "#5a4316"),
    emissiveIntensity: active ? 0.14 : 0.03
  });
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: "#f3da8d",
    roughness: 0.56,
    metalness: 0.02
  });

  for (let index = 0; index < 4; index += 1) {
    const row = markTileShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.94 * scale, 0.07 * scale, 0.16 * scale), rowMaterial)
    );
    row.position.set(0, 0.03 * scale, (index - 1.5) * 0.22 * scale);
    row.rotation.y = 0.12;
    group.add(row);
  }

  const terrace = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.82 * scale, 0.05 * scale, 0.72 * scale), rowMaterial)
  );
  terrace.position.set(0, 0.02 * scale, 0);
  terrace.rotation.y = 0.1;
  group.add(terrace);

  const crossRow = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.46 * scale, 0.034 * scale, 0.14 * scale), rowMaterial)
  );
  crossRow.position.set(-0.1 * scale, 0.04 * scale, 0.06 * scale);
  crossRow.rotation.y = -0.34;
  group.add(crossRow);

  const stalkOffsets = [
    [-0.28, -0.08],
    [-0.1, 0.14],
    [0.06, -0.12],
    [0.24, 0.1],
    [0.34, -0.02],
    [-0.34, 0.24],
    [0.12, 0.28]
  ] as const;
  for (const [x, z] of stalkOffsets) {
    const stalk = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.03 * scale, 0.32 * scale, 5), stalkMaterial)
    );
    stalk.position.set(x * scale, 0.17 * scale, z * scale);
    stalk.rotation.z = 0.08 + x * 0.12;

    const tip = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(0.055 * scale, 0.18 * scale, 5), tipMaterial)
    );
    tip.position.set(x * scale, 0.37 * scale, z * scale);
    tip.rotation.z = 0.12 + x * 0.16;

    group.add(stalk, tip);
  }

  const looseStraw = [
    { x: -0.18, z: -0.24, s: 0.036 },
    { x: 0.24, z: 0.22, s: 0.032 },
    { x: 0.36, z: -0.18, s: 0.028 }
  ] as const;
  for (const entry of looseStraw) {
    const straw = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(entry.s * scale, 0.14 * scale, 5), tipMaterial));
    straw.position.set(entry.x * scale, 0.06 * scale, entry.z * scale);
    straw.rotation.z = 0.24;
    group.add(straw);
  }

  return group;
}

function createClayMesa(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#95563e",
    roughness: 0.94,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#ffd6af" : "#341812"),
    emissiveIntensity: active ? 0.1 : 0.02
  });
  const topMaterial = new THREE.MeshStandardMaterial({
    color: "#c47a56",
    roughness: 0.82,
    metalness: 0.01
  });
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: "#7f4333",
    roughness: 0.92,
    metalness: 0.01
  });
  const rubbleMaterial = new THREE.MeshStandardMaterial({
    color: "#6b3f30",
    roughness: 0.94,
    metalness: 0.01
  });

  const base = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.46 * scale, 0.22 * scale, 7), baseMaterial)
  );
  base.position.y = 0.11 * scale;

  const top = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.3 * scale, 0.1 * scale, 7), topMaterial)
  );
  top.position.set(0.02 * scale, 0.26 * scale, -0.03 * scale);

  const shardLeft = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.16 * scale, 0.4 * scale), shardMaterial)
  );
  shardLeft.position.set(-0.26 * scale, 0.11 * scale, 0.06 * scale);
  shardLeft.rotation.set(0.2, 0.42, -0.26);

  const shardRight = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.12 * scale, 0.34 * scale), shardMaterial)
  );
  shardRight.position.set(0.24 * scale, 0.09 * scale, -0.12 * scale);
  shardRight.rotation.set(-0.12, -0.34, 0.18);

  const lip = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.06 * scale, 0.5 * scale), topMaterial)
  );
  lip.position.set(-0.04 * scale, 0.21 * scale, 0.08 * scale);
  lip.rotation.set(0.04, -0.18, 0.08);

  const rubbleOffsets = [
    { x: -0.36, z: -0.14, s: 0.06 },
    { x: 0.34, z: 0.2, s: 0.08 },
    { x: -0.12, z: 0.34, s: 0.05 }
  ] as const;
  for (const entry of rubbleOffsets) {
    const rubble = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), rubbleMaterial));
    rubble.position.set(entry.x * scale, 0.05 * scale, entry.z * scale);
    rubble.rotation.set(0.18, 0.42, -0.12);
    group.add(rubble);
  }

  group.add(base, top, lip, shardLeft, shardRight);
  return group;
}

function createPastureTuft(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const hillMaterial = new THREE.MeshStandardMaterial({
    color: "#6ca04a",
    roughness: 0.9,
    metalness: 0.02
  });
  const woolMaterial = createWoolMaterial(active, true);
  const faceMaterial = createSheepFaceMaterial();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: "#88bf5d",
    roughness: 0.9,
    metalness: 0.01
  });
  const hoofMaterial = createHoofMaterial();

  const hill = markTileShadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 14, 10), hillMaterial)
  );
  hill.scale.set(1.48, 0.46, 1.08);
  hill.position.y = 0.08 * scale;
  group.add(hill);

  const meadowPatch = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.58 * scale, 0.7 * scale, 0.04 * scale, 7), grassMaterial)
  );
  meadowPatch.position.y = 0.03 * scale;
  group.add(meadowPatch);

  const flowerPatch = createPastureGroundDetail(scale * 0.82, active, "flowers");
  flowerPatch.position.set(-0.08 * scale, 0.01 * scale, 0.24 * scale);
  flowerPatch.rotation.y = 0.4;
  group.add(flowerPatch);

  const grassOffsets = [
    { x: -0.34, z: -0.22, h: 0.16, s: 0.06 },
    { x: -0.18, z: 0.2, h: 0.14, s: 0.05 },
    { x: 0.08, z: -0.3, h: 0.15, s: 0.05 },
    { x: 0.28, z: 0.18, h: 0.18, s: 0.06 },
    { x: 0.38, z: -0.04, h: 0.13, s: 0.05 },
    { x: -0.04, z: 0.34, h: 0.14, s: 0.048 },
    { x: 0.2, z: -0.34, h: 0.12, s: 0.046 },
    { x: -0.28, z: 0.34, h: 0.13, s: 0.044 },
    { x: 0.3, z: 0.32, h: 0.12, s: 0.042 }
  ] as const;
  for (const entry of grassOffsets) {
    const blade = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(entry.s * scale, entry.h * scale, 5), grassMaterial)
    );
    blade.position.set(entry.x * scale, 0.07 * scale, entry.z * scale);
    blade.rotation.z = entry.x * 0.3;
    group.add(blade);
  }

  const sheepEntries = [
    { x: -0.18, z: -0.02, s: 0.64, angle: 0.46 },
    { x: 0.18, z: 0.18, s: 0.58, angle: -0.34 },
    { x: 0.28, z: -0.18, s: 0.5, angle: 0.2 },
    { x: -0.02, z: 0.28, s: 0.42, angle: -0.16 },
    { x: -0.26, z: 0.2, s: 0.38, angle: 0.26 }
  ] as const;
  for (const entry of sheepEntries) {
    const sheep = createSheepFigure(scale * entry.s, woolMaterial, faceMaterial, hoofMaterial, active);
    sheep.position.set(entry.x * scale, 0.08 * scale, entry.z * scale);
    sheep.rotation.y = entry.angle;
    group.add(sheep);
  }

  const trough = createPastureGroundDetail(scale * 0.78, active, "trough");
  trough.position.set(0.24 * scale, 0.01 * scale, 0.02 * scale);
  trough.rotation.y = -0.24;
  group.add(trough);

  const fenceA = createFenceSegment(scale * 0.92, active);
  fenceA.position.set(-0.06 * scale, 0.01 * scale, -0.34 * scale);
  fenceA.rotation.y = 0.34;
  const fenceB = createFenceSegment(scale * 0.78, active);
  fenceB.position.set(-0.28 * scale, 0.01 * scale, -0.18 * scale);
  fenceB.rotation.y = 1.08;
  group.add(fenceA, fenceB);

  return group;
}

function createWoolMaterial(active: boolean, bright: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: bright ? "#eef2ea" : "#e2e7dc",
    roughness: bright ? 0.76 : 0.8,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#fff9d2" : "#394530"),
    emissiveIntensity: active ? 0.1 : 0.02
  });
}

function createSheepFaceMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#6c7869",
    roughness: 0.88,
    metalness: 0.01
  });
}

function createHoofMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#4d4b47",
    roughness: 0.9,
    metalness: 0.01
  });
}

function createDuneCluster(scale: number, active: boolean, withRock: boolean): THREE.Group {
  const group = new THREE.Group();
  const duneMaterial = new THREE.MeshStandardMaterial({
    color: "#d8b16b",
    roughness: 0.96,
    metalness: 0,
    emissive: new THREE.Color(active ? "#ffe3a1" : "#49351b"),
    emissiveIntensity: active ? 0.08 : 0.01
  });
  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color: "#efd094",
    roughness: 0.88,
    metalness: 0
  });
  const accentSandMaterial = new THREE.MeshStandardMaterial({
    color: "#f3d9ab",
    roughness: 0.84,
    metalness: 0
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#8e7454",
    roughness: 0.92,
    metalness: 0.01
  });

  const dune = markTileShadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.44 * scale, 14, 10), duneMaterial)
  );
  dune.scale.set(1.54, 0.36, 0.88);
  dune.position.y = 0.1 * scale;

  const crest = markTileShadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 12, 8), ridgeMaterial)
  );
  crest.scale.set(1.18, 0.24, 0.64);
  crest.position.set(0.14 * scale, 0.18 * scale, -0.06 * scale);

  const backDune = markTileShadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.26 * scale, 12, 8), accentSandMaterial)
  );
  backDune.scale.set(1.24, 0.22, 0.78);
  backDune.position.set(-0.24 * scale, 0.14 * scale, 0.16 * scale);

  const ripple = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 10, 8), accentSandMaterial));
  ripple.position.set(0.26 * scale, 0.04 * scale, 0.18 * scale);
  ripple.scale.set(1.5, 0.16, 0.58);

  const pebbleA = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 * scale, 0), rockMaterial));
  pebbleA.position.set(0.16 * scale, 0.05 * scale, -0.16 * scale);
  const pebbleB = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 * scale, 0), rockMaterial));
  pebbleB.position.set(0.28 * scale, 0.03 * scale, -0.04 * scale);

  group.add(dune, crest, backDune, ripple, pebbleA, pebbleB);

  if (withRock) {
    const rock = markTileShadow(
      new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 * scale, 0), rockMaterial)
    );
    rock.position.set(-0.28 * scale, 0.12 * scale, 0.16 * scale);
    rock.rotation.set(0.28, 0.44, -0.16);
    group.add(rock);
  }

  return group;
}

function createForestAccent(scale: number, active: boolean, withStump: boolean): THREE.Group {
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: "#436133",
    roughness: 0.95,
    metalness: 0.01
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#5d8d47",
    roughness: 0.88,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#d7f2a4" : "#172814"),
    emissiveIntensity: active ? 0.08 : 0.02
  });
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#5a3f24",
    roughness: 0.94,
    metalness: 0.01
  });
  const mushroomMaterial = new THREE.MeshStandardMaterial({
    color: "#d08e64",
    roughness: 0.82,
    metalness: 0.01
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#58625a",
    roughness: 0.96,
    metalness: 0.01
  });

  const patch = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.4 * scale, 0.04 * scale, 6), floorMaterial)
  );
  patch.position.y = 0.02 * scale;
  group.add(patch);

  const saplingOffsets = [
    { x: -0.12, z: -0.06, s: 0.22 },
    { x: 0.14, z: 0.08, s: 0.18 },
    { x: 0.02, z: -0.16, s: 0.16 }
  ] as const;
  for (const entry of saplingOffsets) {
    const trunk = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.016 * scale, 0.022 * scale, 0.12 * scale, 5), trunkMaterial)
    );
    trunk.position.set(entry.x * scale, 0.06 * scale, entry.z * scale);
    const crown = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(entry.s * scale, 0.24 * scale, 6), leafMaterial)
    );
    crown.position.set(entry.x * scale, 0.18 * scale, entry.z * scale);
    group.add(trunk, crown);
  }

  if (withStump) {
    const stump = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.08 * scale, 6), trunkMaterial)
    );
    stump.position.set(-0.18 * scale, 0.04 * scale, 0.12 * scale);
    group.add(stump);

    const logPile = [
      { x: 0.02, z: -0.12, y: 0.03, length: 0.2, radius: 0.03, angle: 0.32 },
      { x: 0.12, z: -0.04, y: 0.03, length: 0.18, radius: 0.028, angle: -0.18 },
      { x: 0.08, z: -0.08, y: 0.08, length: 0.17, radius: 0.026, angle: 0.12 }
    ] as const;
    for (const entry of logPile) {
      const log = markTileShadow(
        new THREE.Mesh(new THREE.CylinderGeometry(entry.radius * scale, entry.radius * scale, entry.length * scale, 8), trunkMaterial)
      );
      log.position.set(entry.x * scale, entry.y * scale, entry.z * scale);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = entry.angle;
      group.add(log);
    }

    const mushroomA = markTileShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.04 * scale, 8, 6), mushroomMaterial)
    );
    mushroomA.position.set(0.1 * scale, 0.05 * scale, 0.12 * scale);
    mushroomA.scale.set(1.1, 0.5, 1);

    const mushroomB = markTileShadow(
      new THREE.Mesh(new THREE.SphereGeometry(0.03 * scale, 8, 6), mushroomMaterial)
    );
    mushroomB.position.set(0.16 * scale, 0.04 * scale, 0.16 * scale);
    mushroomB.scale.set(1.08, 0.46, 1);
    group.add(mushroomA, mushroomB);
  } else {
    const rock = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 * scale, 0), rockMaterial));
    rock.position.set(0.14 * scale, 0.04 * scale, 0.14 * scale);
    rock.rotation.set(0.18, 0.42, -0.14);
    group.add(rock);
  }

  return group;
}

function createForestGroundDetail(
  scale: number,
  active: boolean,
  variant: "fern" | "log" | "stones"
): THREE.Group {
  const group = new THREE.Group();
  const fernMaterial = new THREE.MeshStandardMaterial({
    color: "#5a8b47",
    roughness: 0.9,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#daf3b3" : "#182915"),
    emissiveIntensity: active ? 0.05 : 0.01
  });
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#69492b",
    roughness: 0.94,
    metalness: 0.01
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#647068",
    roughness: 0.96,
    metalness: 0.01
  });

  if (variant === "fern") {
    const leaves = [
      { x: -0.08, z: 0.02, h: 0.12, w: 0.04 },
      { x: 0, z: -0.04, h: 0.14, w: 0.05 },
      { x: 0.08, z: 0.04, h: 0.11, w: 0.038 }
    ] as const;
    for (const entry of leaves) {
      const leaf = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(entry.w * scale, entry.h * scale, 4), fernMaterial)
      );
      leaf.position.set(entry.x * scale, 0.05 * scale, entry.z * scale);
      leaf.rotation.z = entry.x * 1.5;
      group.add(leaf);
    }
    return group;
  }

  if (variant === "log") {
    const logEntries = [
      { x: -0.08, z: 0.02, y: 0.03, length: 0.16, radius: 0.024, angle: 0.4 },
      { x: 0.04, z: -0.04, y: 0.03, length: 0.18, radius: 0.026, angle: -0.26 },
      { x: -0.01, z: 0.08, y: 0.07, length: 0.14, radius: 0.022, angle: 0.12 }
    ] as const;
    for (const entry of logEntries) {
      const log = markTileShadow(
        new THREE.Mesh(new THREE.CylinderGeometry(entry.radius * scale, entry.radius * scale, entry.length * scale, 8), trunkMaterial)
      );
      log.position.set(entry.x * scale, entry.y * scale, entry.z * scale);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = entry.angle;
      group.add(log);
    }

    const stump = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.05 * scale, 8), trunkMaterial)
    );
    stump.position.set(0.12 * scale, 0.025 * scale, 0.08 * scale);
    const sprout = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(0.04 * scale, 0.12 * scale, 5), fernMaterial)
    );
    sprout.position.set(-0.08 * scale, 0.04 * scale, 0.08 * scale);
    sprout.rotation.z = -0.18;
    group.add(stump, sprout);
    return group;
  }

  const rockA = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 * scale, 0), rockMaterial));
  rockA.position.set(-0.06 * scale, 0.02 * scale, 0.04 * scale);
  rockA.rotation.set(0.18, 0.4, -0.12);
  const rockB = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 * scale, 0), rockMaterial));
  rockB.position.set(0.08 * scale, 0.02 * scale, -0.04 * scale);
  rockB.rotation.set(0.12, -0.34, 0.1);
  const fern = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.03 * scale, 0.1 * scale, 4), fernMaterial));
  fern.position.set(0.02 * scale, 0.04 * scale, 0.08 * scale);
  group.add(rockA, rockB, fern);
  return group;
}

function createOreOutcrop(scale: number, active: boolean, crystalHeavy: boolean): THREE.Group {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#667283",
    roughness: 0.95,
    metalness: 0.03
  });
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: crystalHeavy ? "#d9ecff" : "#b4d4ef",
    roughness: 0.44,
    metalness: 0.08,
    emissive: new THREE.Color(active ? "#a6d8ff" : "#24303a"),
    emissiveIntensity: active ? 0.12 : 0.03
  });

  const base = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 * scale, 0), rockMaterial));
  base.position.set(0, 0.05 * scale, 0);
  base.scale.set(1.28, 0.84, 1.14);
  group.add(base);

  const crystalCount = crystalHeavy ? 3 : 2;
  for (let index = 0; index < crystalCount; index += 1) {
    const crystal = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.018 * scale, 0.04 * scale, (0.16 + index * 0.03) * scale, 6), crystalMaterial)
    );
    crystal.position.set((-0.08 + index * 0.08) * scale, (0.1 + index * 0.01) * scale, (index % 2 === 0 ? 0.06 : -0.04) * scale);
    crystal.rotation.set(0.12, index * 0.24, 0.18);
    group.add(crystal);
  }

  const rockOffsets = crystalHeavy
    ? [
        { x: -0.12, z: 0.12, s: 0.055 },
        { x: 0.12, z: 0.1, s: 0.05 },
        { x: 0.16, z: -0.08, s: 0.042 }
      ]
    : [
        { x: -0.1, z: 0.1, s: 0.046 },
        { x: 0.1, z: 0.12, s: 0.04 }
      ];
  for (const entry of rockOffsets) {
    const rubble = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), rockMaterial));
    rubble.position.set(entry.x * scale, 0.03 * scale, entry.z * scale);
    rubble.rotation.set(0.18, entry.x * 2.4, -0.08);
    group.add(rubble);
  }

  const oreShard = markTileShadow(
    new THREE.Mesh(new THREE.OctahedronGeometry((crystalHeavy ? 0.05 : 0.04) * scale, 0), crystalMaterial)
  );
  oreShard.position.set(-0.02 * scale, 0.05 * scale, -0.12 * scale);
  oreShard.scale.set(0.72, 1.16, 0.68);
  oreShard.rotation.y = 0.38;
  group.add(oreShard);

  return group;
}

function createOreScatter(
  scale: number,
  active: boolean,
  variant: "rubble" | "crystal" | "ledge"
): THREE.Group {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#6a7380",
    roughness: 0.95,
    metalness: 0.03
  });
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: "#cfe4fb",
    roughness: 0.42,
    metalness: 0.08,
    emissive: new THREE.Color(active ? "#9ed6ff" : "#1f2a34"),
    emissiveIntensity: active ? 0.08 : 0.02
  });
  const ledgeMaterial = new THREE.MeshStandardMaterial({
    color: "#8b97a8",
    roughness: 0.86,
    metalness: 0.04
  });

  if (variant === "rubble") {
    const offsets = [
      { x: -0.08, z: 0.02, s: 0.038 },
      { x: 0.02, z: -0.06, s: 0.048 },
      { x: 0.1, z: 0.06, s: 0.034 },
      { x: 0.12, z: -0.02, s: 0.026 }
    ] as const;
    for (const entry of offsets) {
      const rubble = markTileShadow(
        new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), rockMaterial)
      );
      rubble.position.set(entry.x * scale, 0.02 * scale, entry.z * scale);
      rubble.rotation.set(0.16, entry.x * 2.2, -0.08);
      group.add(rubble);
    }
    const shard = markTileShadow(
      new THREE.Mesh(new THREE.OctahedronGeometry(0.03 * scale, 0), crystalMaterial)
    );
    shard.position.set(-0.02 * scale, 0.03 * scale, 0.1 * scale);
    shard.scale.set(0.7, 1.28, 0.74);
    group.add(shard);
    return group;
  }

  if (variant === "crystal") {
    const base = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 * scale, 0), rockMaterial));
    base.position.set(0, 0.02 * scale, 0);
    const crystalA = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.012 * scale, 0.028 * scale, 0.12 * scale, 6), crystalMaterial)
    );
    crystalA.position.set(-0.04 * scale, 0.07 * scale, 0.04 * scale);
    crystalA.rotation.set(0.12, 0.18, 0.24);
    const crystalB = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.01 * scale, 0.022 * scale, 0.1 * scale, 6), crystalMaterial)
    );
    crystalB.position.set(0.04 * scale, 0.06 * scale, -0.02 * scale);
    crystalB.rotation.set(-0.08, -0.18, 0.18);
    group.add(base, crystalA, crystalB);
    return group;
  }

  const ledge = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, 0.04 * scale, 0.12 * scale), ledgeMaterial)
  );
  ledge.position.set(0, 0.02 * scale, 0);
  ledge.rotation.set(0.04, 0.28, -0.06);
  const stone = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.032 * scale, 0), rockMaterial));
  stone.position.set(0.08 * scale, 0.03 * scale, 0.04 * scale);
  const shard = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.03 * scale, 0.06 * scale, 0.02 * scale), crystalMaterial)
  );
  shard.position.set(-0.06 * scale, 0.05 * scale, -0.04 * scale);
  shard.rotation.set(0.1, 0.22, 0.18);
  group.add(ledge, stone, shard);
  return group;
}

function createHayFeature(scale: number, active: boolean, stacked: boolean): THREE.Group {
  const group = new THREE.Group();
  const baleMaterial = new THREE.MeshStandardMaterial({
    color: "#ddb55a",
    roughness: 0.84,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#fff1a8" : "#56441a"),
    emissiveIntensity: active ? 0.08 : 0.02
  });
  const strawMaterial = new THREE.MeshStandardMaterial({
    color: "#f1d684",
    roughness: 0.72,
    metalness: 0.01
  });

  const bale = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.09 * scale, 0.18 * scale, 8), baleMaterial)
  );
  bale.position.set(0, 0.08 * scale, 0);
  bale.rotation.z = Math.PI / 2;
  group.add(bale);

  if (stacked) {
    const topBale = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.16 * scale, 8), baleMaterial)
    );
    topBale.position.set(0.04 * scale, 0.18 * scale, -0.02 * scale);
    topBale.rotation.z = Math.PI / 2;
    group.add(topBale);
  }

  const strawOffsets = [
    [-0.14, 0.08],
    [0.12, 0.12],
    [0.04, -0.14]
  ] as const;
  for (const [x, z] of strawOffsets) {
    const stalk = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(0.034 * scale, 0.16 * scale, 5), strawMaterial)
    );
    stalk.position.set(x * scale, 0.06 * scale, z * scale);
    stalk.rotation.z = 0.22;
    group.add(stalk);
  }

  return group;
}

function createFieldDetail(
  scale: number,
  active: boolean,
  variant: "furrow" | "tuft" | "stook"
): THREE.Group {
  const group = new THREE.Group();
  const soilMaterial = new THREE.MeshStandardMaterial({
    color: "#ba8e45",
    roughness: 0.9,
    metalness: 0.01
  });
  const strawMaterial = new THREE.MeshStandardMaterial({
    color: "#f0d37f",
    roughness: 0.74,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#fff2b0" : "#5b451b"),
    emissiveIntensity: active ? 0.06 : 0.01
  });
  const tieMaterial = new THREE.MeshStandardMaterial({
    color: "#8f6a2d",
    roughness: 0.9,
    metalness: 0.01
  });

  if (variant === "furrow") {
    for (let index = 0; index < 2; index += 1) {
      const row = markTileShadow(
        new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.022 * scale, 0.05 * scale), soilMaterial)
      );
      row.position.set(0, 0.01 * scale, (index === 0 ? -0.05 : 0.05) * scale);
      row.rotation.y = 0.12;
      group.add(row);
    }
    const tuft = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.03 * scale, 0.1 * scale, 5), strawMaterial));
    tuft.position.set(0.06 * scale, 0.04 * scale, 0);
    group.add(tuft);
    return group;
  }

  if (variant === "tuft") {
    const offsets = [
      { x: -0.04, z: 0.04, h: 0.1 },
      { x: 0.02, z: -0.02, h: 0.12 },
      { x: 0.07, z: 0.05, h: 0.09 }
    ] as const;
    for (const entry of offsets) {
      const stalk = markTileShadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.026 * scale, entry.h * scale, 5), strawMaterial)
      );
      stalk.position.set(entry.x * scale, 0.04 * scale, entry.z * scale);
      stalk.rotation.z = 0.18;
      group.add(stalk);
    }
    return group;
  }

  const bundleOffsets = [-0.04, 0, 0.04] as const;
  for (const x of bundleOffsets) {
    const stalk = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.01 * scale, 0.014 * scale, 0.12 * scale, 4), strawMaterial)
    );
    stalk.position.set(x * scale, 0.05 * scale, 0);
    stalk.rotation.z = x * 2.8;
    group.add(stalk);
  }
  const tie = markTileShadow(new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.018 * scale, 0.02 * scale), tieMaterial));
  tie.position.set(0, 0.04 * scale, 0);
  tie.rotation.y = 0.18;
  group.add(tie);
  return group;
}

function createFarmsteadFeature(
  scale: number,
  active: boolean,
  variant: "barn" | "scarecrow"
): THREE.Group {
  const group = new THREE.Group();
  const earthMaterial = new THREE.MeshStandardMaterial({
    color: "#8e6a31",
    roughness: 0.9,
    metalness: 0.01
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#8a5a36",
    roughness: 0.9,
    metalness: 0.01
  });
  const barnMaterial = new THREE.MeshStandardMaterial({
    color: "#b54c35",
    roughness: 0.86,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#ffd6a2" : "#351b14"),
    emissiveIntensity: active ? 0.06 : 0.01
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: "#6c3a28",
    roughness: 0.9,
    metalness: 0.01
  });
  const strawMaterial = new THREE.MeshStandardMaterial({
    color: "#f0d98e",
    roughness: 0.76,
    metalness: 0.01
  });
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: "#d2b15c",
    roughness: 0.82,
    metalness: 0.01
  });

  const patch = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.3 * scale, 0.03 * scale, 6), earthMaterial)
  );
  patch.position.y = 0.014 * scale;
  group.add(patch);

  if (variant === "barn") {
    const body = markTileShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.18 * scale, 0.22 * scale), barnMaterial)
    );
    body.position.set(0, 0.1 * scale, 0);
    const roof = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.34 * scale, 3), roofMaterial)
    );
    roof.position.set(0, 0.24 * scale, 0);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    const door = markTileShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.12 * scale, 0.02 * scale), woodMaterial)
    );
    door.position.set(0, 0.07 * scale, 0.12 * scale);
    const silo = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.07 * scale, 0.22 * scale, 8), woodMaterial)
    );
    silo.position.set(0.18 * scale, 0.11 * scale, -0.04 * scale);
    const siloTop = markTileShadow(
      new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.08 * scale, 8), roofMaterial)
    );
    siloTop.position.set(0.18 * scale, 0.26 * scale, -0.04 * scale);
    const bale = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.12 * scale, 8), strawMaterial)
    );
    bale.position.set(-0.18 * scale, 0.05 * scale, 0.02 * scale);
    bale.rotation.z = Math.PI / 2;
    group.add(body, roof, door, silo, siloTop, bale);
    return group;
  }

  const post = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.016 * scale, 0.022 * scale, 0.3 * scale, 5), woodMaterial)
  );
  post.position.set(0, 0.15 * scale, 0);
  const beam = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.02 * scale, 0.024 * scale), woodMaterial)
  );
  beam.position.set(0, 0.22 * scale, 0);
  const cloth = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.09 * scale, 0.03 * scale), clothMaterial)
  );
  cloth.position.set(0, 0.16 * scale, 0);
  const hat = markTileShadow(
    new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.09 * scale, 6), roofMaterial)
  );
  hat.position.set(0, 0.29 * scale, 0);
  const strawA = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.02 * scale, 0.08 * scale, 4), strawMaterial));
  strawA.position.set(-0.08 * scale, 0.19 * scale, 0);
  strawA.rotation.z = 0.5;
  const strawB = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.02 * scale, 0.08 * scale, 4), strawMaterial));
  strawB.position.set(0.08 * scale, 0.19 * scale, 0);
  strawB.rotation.z = -0.5;
  group.add(post, beam, cloth, hat, strawA, strawB);
  return group;
}

function createClayAccent(scale: number, active: boolean, withPit: boolean): THREE.Group {
  const group = new THREE.Group();
  const slabMaterial = new THREE.MeshStandardMaterial({
    color: "#8c513d",
    roughness: 0.94,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#f1c2a7" : "#2e1912"),
    emissiveIntensity: active ? 0.06 : 0.01
  });
  const rubbleMaterial = new THREE.MeshStandardMaterial({
    color: "#6f4031",
    roughness: 0.96,
    metalness: 0.01
  });

  const slab = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.06 * scale, 0.18 * scale), slabMaterial)
  );
  slab.position.set(0, 0.03 * scale, 0);
  slab.rotation.set(0.06, 0.28, -0.04);
  group.add(slab);

  if (withPit) {
    const pitLip = markTileShadow(
      new THREE.Mesh(new THREE.TorusGeometry(0.1 * scale, 0.024 * scale, 8, 20), slabMaterial)
    );
    pitLip.position.set(0.08 * scale, 0.02 * scale, -0.06 * scale);
    pitLip.rotation.x = Math.PI / 2;
    group.add(pitLip);
  }

  const rubbleOffsets = [
    { x: -0.12, z: 0.08, s: 0.04 },
    { x: 0.1, z: 0.12, s: 0.05 },
    { x: 0.16, z: -0.1, s: 0.035 }
  ] as const;
  for (const entry of rubbleOffsets) {
    const rubble = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), rubbleMaterial));
    rubble.position.set(entry.x * scale, 0.03 * scale, entry.z * scale);
    rubble.rotation.set(0.18, 0.4, -0.12);
    group.add(rubble);
  }

  return group;
}

function createClayScatter(
  scale: number,
  active: boolean,
  variant: "rubble" | "cut" | "pit"
): THREE.Group {
  const group = new THREE.Group();
  const clayMaterial = new THREE.MeshStandardMaterial({
    color: "#91543e",
    roughness: 0.95,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#efc3aa" : "#2e1a13"),
    emissiveIntensity: active ? 0.05 : 0.01
  });
  const darkClayMaterial = new THREE.MeshStandardMaterial({
    color: "#6f4032",
    roughness: 0.96,
    metalness: 0.01
  });

  if (variant === "rubble") {
    const offsets = [
      { x: -0.08, z: 0.04, s: 0.04 },
      { x: 0.02, z: -0.06, s: 0.03 },
      { x: 0.08, z: 0.08, s: 0.034 }
    ] as const;
    for (const entry of offsets) {
      const piece = markTileShadow(
        new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s * scale, 0), darkClayMaterial)
      );
      piece.position.set(entry.x * scale, 0.02 * scale, entry.z * scale);
      piece.rotation.set(0.16, entry.x * 2.1, -0.08);
      group.add(piece);
    }

    const bricks = [
      { x: -0.02, z: 0.12, w: 0.08, h: 0.03, d: 0.05 },
      { x: 0.08, z: 0.14, w: 0.07, h: 0.028, d: 0.045 }
    ] as const;
    for (const entry of bricks) {
      const brick = markTileShadow(
        new THREE.Mesh(new THREE.BoxGeometry(entry.w * scale, entry.h * scale, entry.d * scale), clayMaterial)
      );
      brick.position.set(entry.x * scale, entry.h * scale * 0.6, entry.z * scale);
      brick.rotation.y = entry.x * 2.2;
      group.add(brick);
    }
    return group;
  }

  if (variant === "cut") {
    const brickEntries = [
      { x: -0.08, z: 0.02, w: 0.12, h: 0.04, d: 0.07, y: 0.02 },
      { x: 0.04, z: -0.02, w: 0.11, h: 0.038, d: 0.065, y: 0.02 },
      { x: -0.01, z: 0.08, w: 0.1, h: 0.034, d: 0.06, y: 0.055 }
    ] as const;
    for (const entry of brickEntries) {
      const brick = markTileShadow(
        new THREE.Mesh(new THREE.BoxGeometry(entry.w * scale, entry.h * scale, entry.d * scale), clayMaterial)
      );
      brick.position.set(entry.x * scale, entry.y * scale, entry.z * scale);
      brick.rotation.set(0.04, entry.x * 2.8, -0.03);
      group.add(brick);
    }
    const chip = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 * scale, 0), darkClayMaterial));
    chip.position.set(0.08 * scale, 0.02 * scale, -0.06 * scale);
    group.add(chip);
    return group;
  }

  const pitRing = markTileShadow(
    new THREE.Mesh(new THREE.TorusGeometry(0.07 * scale, 0.016 * scale, 6, 14), clayMaterial)
  );
  pitRing.position.set(0, 0.016 * scale, 0);
  pitRing.rotation.x = Math.PI / 2;
  const pitCore = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.012 * scale, 12), darkClayMaterial)
  );
  pitCore.position.set(0, 0.004 * scale, 0);
  group.add(pitRing, pitCore);
  return group;
}

function createClayIndustryFeature(
  scale: number,
  active: boolean,
  variant: "kiln" | "stack"
): THREE.Group {
  const group = new THREE.Group();
  const clayMaterial = new THREE.MeshStandardMaterial({
    color: "#9b5a43",
    roughness: 0.94,
    metalness: 0.01
  });
  const darkClayMaterial = new THREE.MeshStandardMaterial({
    color: "#6b3a2c",
    roughness: 0.96,
    metalness: 0.01
  });
  const emberMaterial = new THREE.MeshStandardMaterial({
    color: "#ffb16b",
    roughness: 0.54,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#ffcf8a" : "#4a2316"),
    emissiveIntensity: active ? 0.16 : 0.04
  });

  if (variant === "kiln") {
    const base = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.18 * scale, 0.1 * scale, 8), clayMaterial)
    );
    base.position.set(0, 0.05 * scale, 0);
    const dome = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 10, 8), darkClayMaterial));
    dome.position.set(0, 0.14 * scale, 0);
    dome.scale.set(1.16, 0.8, 1);
    const chimney = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.04 * scale, 0.18 * scale, 6), darkClayMaterial)
    );
    chimney.position.set(0.1 * scale, 0.24 * scale, -0.02 * scale);
    const opening = markTileShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.05 * scale, 0.03 * scale), emberMaterial)
    );
    opening.position.set(0, 0.1 * scale, 0.14 * scale);
    group.add(base, dome, chimney, opening);
    return group;
  }

  const stackOffsets = [
    { x: -0.1, z: 0.04, layers: 2 },
    { x: 0.06, z: -0.04, layers: 3 },
    { x: 0.14, z: 0.1, layers: 1 }
  ] as const;
  for (const entry of stackOffsets) {
    for (let layer = 0; layer < entry.layers; layer += 1) {
      const brick = markTileShadow(
        new THREE.Mesh(new THREE.BoxGeometry(0.09 * scale, 0.028 * scale, 0.052 * scale), clayMaterial)
      );
      brick.position.set(
        (entry.x + (layer % 2 === 0 ? -0.02 : 0.02)) * scale,
        (0.018 + layer * 0.03) * scale,
        (entry.z + layer * 0.012) * scale
      );
      brick.rotation.y = layer % 2 === 0 ? 0.18 : -0.12;
      group.add(brick);
    }
  }
  const board = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.02 * scale, 0.04 * scale), darkClayMaterial)
  );
  board.position.set(-0.02 * scale, 0.03 * scale, -0.14 * scale);
  board.rotation.y = 0.18;
  group.add(board);
  return group;
}

function createPastureAccent(
  scale: number,
  active: boolean,
  variant: "fence" | "lamb" | "shrub" | "trough" | "flowers"
): THREE.Group {
  if (variant === "fence") {
    return createFenceSegment(scale * 1.28, active);
  }
  if (variant === "lamb") {
    return createSheepFigure(scale * 1.18, createWoolMaterial(active, false), createSheepFaceMaterial(), createHoofMaterial(), active);
  }
  if (variant === "trough") {
    return createPastureGroundDetail(scale * 1.24, active, "trough");
  }
  if (variant === "flowers") {
    return createPastureGroundDetail(scale * 1.2, active, "flowers");
  }
  return createPastureShrub(scale * 1.16, active);
}

function createFenceSegment(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#8a6a44",
    roughness: 0.92,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#f6d89e" : "#2e2416"),
    emissiveIntensity: active ? 0.04 : 0.01
  });

  const postOffsets = [-0.1, 0.1] as const;
  for (const x of postOffsets) {
    const post = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.018 * scale, 0.022 * scale, 0.18 * scale, 5), woodMaterial)
    );
    post.position.set(x * scale, 0.09 * scale, 0);
    group.add(post);
  }

  const railTop = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.024 * scale, 0.03 * scale), woodMaterial)
  );
  railTop.position.set(0, 0.14 * scale, 0);
  const railBottom = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.024 * scale, 0.03 * scale), woodMaterial)
  );
  railBottom.position.set(0, 0.08 * scale, 0);
  group.add(railTop, railBottom);

  return group;
}

function createPastureShrub(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: "#79aa55",
    roughness: 0.9,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#d8f7b0" : "#22331a"),
    emissiveIntensity: active ? 0.05 : 0.01
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: "#8a9489",
    roughness: 0.96,
    metalness: 0.01
  });

  const shrub = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 8, 6), shrubMaterial));
  shrub.position.set(0, 0.06 * scale, 0);
  shrub.scale.set(1.28, 0.78, 1.06);
  const stone = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 * scale, 0), stoneMaterial));
  stone.position.set(0.12 * scale, 0.02 * scale, 0.08 * scale);
  group.add(shrub, stone);
  return group;
}

function createPastureGroundDetail(
  scale: number,
  active: boolean,
  variant: "flowers" | "trough" | "shrub"
): THREE.Group {
  if (variant === "shrub") {
    return createPastureShrub(scale, active);
  }

  const group = new THREE.Group();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: "#83b85d",
    roughness: 0.9,
    metalness: 0.01
  });
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#f6e6a5",
    roughness: 0.7,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#fff7c4" : "#514927"),
    emissiveIntensity: active ? 0.06 : 0.01
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#8d6d45",
    roughness: 0.92,
    metalness: 0.01
  });
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: "#8fd1d9",
    roughness: 0.34,
    metalness: 0.03,
    emissive: new THREE.Color(active ? "#a9ecf5" : "#24414a"),
    emissiveIntensity: active ? 0.04 : 0.01
  });

  if (variant === "flowers") {
    const flowers = [
      { x: -0.06, z: 0.02, y: 0.05, s: 0.018 },
      { x: 0.02, z: -0.04, y: 0.06, s: 0.02 },
      { x: 0.08, z: 0.05, y: 0.048, s: 0.016 }
    ] as const;
    for (const entry of flowers) {
      const stem = markTileShadow(
        new THREE.Mesh(new THREE.CylinderGeometry(0.005 * scale, 0.007 * scale, 0.08 * scale, 4), grassMaterial)
      );
      stem.position.set(entry.x * scale, entry.y * scale, entry.z * scale);
      const bloom = markTileShadow(
        new THREE.Mesh(new THREE.SphereGeometry(entry.s * scale, 8, 6), petalMaterial)
      );
      bloom.position.set(entry.x * scale, (entry.y + 0.04) * scale, entry.z * scale);
      bloom.scale.set(1.3, 0.7, 1.1);
      group.add(stem, bloom);
    }
    return group;
  }

  const troughBase = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.05 * scale, 0.09 * scale), woodMaterial)
  );
  troughBase.position.set(0, 0.02 * scale, 0);
  const water = markTileShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.012 * scale, 0.05 * scale), waterMaterial)
  );
  water.position.set(0, 0.05 * scale, 0);
  const grass = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.028 * scale, 0.09 * scale, 5), grassMaterial));
  grass.position.set(-0.08 * scale, 0.04 * scale, 0.04 * scale);
  grass.rotation.z = -0.16;
  group.add(troughBase, water, grass);
  return group;
}

function createSheepfoldFeature(scale: number, active: boolean): THREE.Group {
  const group = new THREE.Group();
  const woolMaterial = createWoolMaterial(active, true);
  const faceMaterial = createSheepFaceMaterial();
  const hoofMaterial = createHoofMaterial();

  const fenceFront = createFenceSegment(scale * 1.34, active);
  fenceFront.position.set(0, 0.01 * scale, 0.18 * scale);
  const fenceLeft = createFenceSegment(scale * 1.12, active);
  fenceLeft.position.set(-0.16 * scale, 0.01 * scale, 0.04 * scale);
  fenceLeft.rotation.y = Math.PI / 2;
  const fenceRight = createFenceSegment(scale * 1.12, active);
  fenceRight.position.set(0.16 * scale, 0.01 * scale, 0.04 * scale);
  fenceRight.rotation.y = Math.PI / 2;

  const sheepA = createSheepFigure(scale * 0.84, woolMaterial, faceMaterial, hoofMaterial, active);
  sheepA.position.set(-0.04 * scale, 0.02 * scale, -0.02 * scale);
  sheepA.rotation.y = 0.3;
  const sheepB = createSheepFigure(scale * 0.7, createWoolMaterial(active, false), faceMaterial, hoofMaterial, active);
  sheepB.position.set(0.08 * scale, 0.02 * scale, -0.08 * scale);
  sheepB.rotation.y = -0.34;
  const trough = createPastureGroundDetail(scale * 1.02, active, "trough");
  trough.position.set(0, 0.01 * scale, -0.18 * scale);

  group.add(fenceFront, fenceLeft, fenceRight, sheepA, sheepB, trough);
  return group;
}

function createCactusCluster(scale: number, active: boolean, tall: boolean): THREE.Group {
  const group = new THREE.Group();
  const cactusMaterial = new THREE.MeshStandardMaterial({
    color: tall ? "#4c8c47" : "#638f4c",
    roughness: 0.88,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#c6eda0" : "#17311a"),
    emissiveIntensity: active ? 0.08 : 0.02
  });
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: "#cda96f",
    roughness: 0.94,
    metalness: 0
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#8d7656",
    roughness: 0.95,
    metalness: 0.01
  });

  const patch = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.2 * scale, 0.03 * scale, 6), sandMaterial)
  );
  patch.position.y = 0.01 * scale;
  const trunk = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.055 * scale, (tall ? 0.34 : 0.24) * scale, 8), cactusMaterial)
  );
  trunk.position.set(0, (tall ? 0.17 : 0.12) * scale, 0);
  const armLeft = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.028 * scale, 0.14 * scale, 8), cactusMaterial)
  );
  armLeft.position.set(-0.06 * scale, (tall ? 0.18 : 0.12) * scale, 0.02 * scale);
  armLeft.rotation.z = Math.PI / 2.8;
  const armRight = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.026 * scale, 0.12 * scale, 8), cactusMaterial)
  );
  armRight.position.set(0.06 * scale, (tall ? 0.24 : 0.14) * scale, -0.02 * scale);
  armRight.rotation.z = -Math.PI / 2.7;
  const rock = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.038 * scale, 0), rockMaterial));
  rock.position.set(0.12 * scale, 0.02 * scale, 0.08 * scale);

  group.add(patch, trunk, armLeft, armRight, rock);

  if (tall) {
    const smallCactus = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.026 * scale, 0.032 * scale, 0.16 * scale, 8), cactusMaterial)
    );
    smallCactus.position.set(-0.12 * scale, 0.08 * scale, -0.08 * scale);
    group.add(smallCactus);
  }

  return group;
}

function createDesertAccent(scale: number, active: boolean, withBones: boolean): THREE.Group {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#8d7757",
    roughness: 0.95,
    metalness: 0.01
  });
  const boneMaterial = new THREE.MeshStandardMaterial({
    color: "#e8dcc3",
    roughness: 0.72,
    metalness: 0.01
  });

  const cactus = createCactusCluster(scale * 0.86, active, !withBones);
  cactus.position.set(-0.02 * scale, 0, -0.02 * scale);
  const rock = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 * scale, 0), rockMaterial));
  rock.position.set(0.14 * scale, 0.03 * scale, 0.08 * scale);
  group.add(cactus, rock);

  if (withBones) {
    const boneA = markTileShadow(
      new THREE.Mesh(new THREE.CapsuleGeometry(0.012 * scale, 0.08 * scale, 3, 6), boneMaterial)
    );
    boneA.position.set(-0.12 * scale, 0.03 * scale, -0.08 * scale);
    boneA.rotation.z = Math.PI / 2;
    const boneB = markTileShadow(
      new THREE.Mesh(new THREE.CapsuleGeometry(0.012 * scale, 0.06 * scale, 3, 6), boneMaterial)
    );
    boneB.position.set(-0.1 * scale, 0.03 * scale, -0.02 * scale);
    boneB.rotation.z = 0.48;
    group.add(boneA, boneB);
  }

  return group;
}

function createDesertScatter(
  scale: number,
  active: boolean,
  variant: "ripple" | "scrub" | "bones"
): THREE.Group {
  const group = new THREE.Group();
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: "#dfbe83",
    roughness: 0.95,
    metalness: 0
  });
  const scrubMaterial = new THREE.MeshStandardMaterial({
    color: "#a08d58",
    roughness: 0.94,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#f0d699" : "#322819"),
    emissiveIntensity: active ? 0.04 : 0.01
  });
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#8e7858",
    roughness: 0.95,
    metalness: 0.01
  });
  const boneMaterial = new THREE.MeshStandardMaterial({
    color: "#eadfc9",
    roughness: 0.74,
    metalness: 0.01
  });

  if (variant === "ripple") {
    const rippleA = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 8, 6), sandMaterial));
    rippleA.position.set(-0.04 * scale, 0.012 * scale, 0.03 * scale);
    rippleA.scale.set(1.5, 0.18, 0.7);
    const rippleB = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 8, 6), sandMaterial));
    rippleB.position.set(0.06 * scale, 0.01 * scale, -0.04 * scale);
    rippleB.scale.set(1.3, 0.16, 0.62);
    const pebble = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.024 * scale, 0), rockMaterial));
    pebble.position.set(0.1 * scale, 0.015 * scale, 0.06 * scale);
    group.add(rippleA, rippleB, pebble);
    return group;
  }

  if (variant === "scrub") {
    const cactus = createCactusCluster(scale * 0.58, active, false);
    cactus.position.set(0, 0, 0);
    const stone = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.034 * scale, 0), rockMaterial));
    stone.position.set(0.08 * scale, 0.02 * scale, 0.06 * scale);
    const dryBush = markTileShadow(new THREE.Mesh(new THREE.ConeGeometry(0.03 * scale, 0.09 * scale, 5), scrubMaterial));
    dryBush.position.set(-0.08 * scale, 0.04 * scale, -0.04 * scale);
    dryBush.rotation.z = 0.16;
    group.add(cactus, stone, dryBush);
    return group;
  }

  const boneA = markTileShadow(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.008 * scale, 0.06 * scale, 3, 6), boneMaterial)
  );
  boneA.position.set(-0.04 * scale, 0.018 * scale, 0.02 * scale);
  boneA.rotation.z = Math.PI / 2;
  const boneB = markTileShadow(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.008 * scale, 0.05 * scale, 3, 6), boneMaterial)
  );
  boneB.position.set(0.02 * scale, 0.018 * scale, -0.03 * scale);
  boneB.rotation.z = 0.52;
  const pebble = markTileShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.024 * scale, 0), rockMaterial));
  pebble.position.set(0.08 * scale, 0.016 * scale, 0.05 * scale);
  group.add(boneA, boneB, pebble);
  return group;
}

function createSheepFigure(
  scale: number,
  woolMaterial: THREE.MeshStandardMaterial,
  faceMaterial: THREE.MeshStandardMaterial,
  hoofMaterial: THREE.MeshStandardMaterial,
  active: boolean
): THREE.Group {
  const group = new THREE.Group();
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: "#fff7eb",
    roughness: 0.62,
    metalness: 0.01,
    emissive: new THREE.Color(active ? "#fff1ba" : "#443f34"),
    emissiveIntensity: active ? 0.08 : 0.01
  });
  const muzzleMaterial = new THREE.MeshStandardMaterial({
    color: "#d6d1c5",
    roughness: 0.76,
    metalness: 0.01
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#101417",
    roughness: 0.46,
    metalness: 0.04
  });

  const body = markTileShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * scale, 0.16 * scale, 4, 8), woolMaterial));
  body.position.set(-0.01 * scale, 0.16 * scale, 0);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1.12, 1, 0.92);

  const bodyPuffA = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.11 * scale, 10, 8), glowMaterial));
  bodyPuffA.position.set(-0.14 * scale, 0.18 * scale, 0.07 * scale);
  bodyPuffA.scale.set(1.08, 0.92, 1);

  const bodyPuffB = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 10, 8), glowMaterial));
  bodyPuffB.position.set(0.02 * scale, 0.2 * scale, -0.08 * scale);

  const bodyPuffC = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.096 * scale, 10, 8), glowMaterial));
  bodyPuffC.position.set(0.1 * scale, 0.17 * scale, 0.06 * scale);

  const rumpPuff = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.082 * scale, 8, 6), glowMaterial));
  rumpPuff.position.set(-0.2 * scale, 0.15 * scale, -0.02 * scale);

  const neck = markTileShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.1 * scale, 6), faceMaterial)
  );
  neck.position.set(0.12 * scale, 0.17 * scale, 0.01 * scale);
  neck.rotation.z = -0.92;

  const head = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.086 * scale, 10, 8), faceMaterial));
  head.position.set(0.23 * scale, 0.19 * scale, 0.02 * scale);
  head.scale.set(0.92, 0.84, 1.18);

  const muzzle = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 8, 6), muzzleMaterial));
  muzzle.position.set(0.3 * scale, 0.16 * scale, 0.02 * scale);
  muzzle.scale.set(1.08, 0.72, 0.86);

  const earLeft = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.03 * scale, 8, 6), faceMaterial));
  earLeft.position.set(0.22 * scale, 0.27 * scale, 0.08 * scale);
  earLeft.scale.set(0.74, 0.26, 1.28);
  earLeft.rotation.set(0.08, 0.14, -0.38);

  const earRight = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.03 * scale, 8, 6), faceMaterial));
  earRight.position.set(0.22 * scale, 0.26 * scale, -0.05 * scale);
  earRight.scale.set(0.74, 0.26, 1.18);
  earRight.rotation.set(-0.08, 0.1, -0.34);

  const eyeLeft = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.01 * scale, 6, 6), eyeMaterial));
  eyeLeft.position.set(0.28 * scale, 0.2 * scale, 0.05 * scale);

  const eyeRight = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.01 * scale, 6, 6), eyeMaterial));
  eyeRight.position.set(0.28 * scale, 0.2 * scale, -0.01 * scale);

  const tail = markTileShadow(new THREE.Mesh(new THREE.SphereGeometry(0.034 * scale, 8, 6), glowMaterial));
  tail.position.set(-0.24 * scale, 0.19 * scale, -0.01 * scale);
  tail.scale.set(0.86, 0.72, 0.92);

  const legOffsets = [
    [-0.12, -0.08],
    [-0.04, 0.08],
    [0.07, -0.06],
    [0.16, 0.06]
  ] as const;
  for (const [index, [x, z]] of legOffsets.entries()) {
    const leg = markTileShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.012 * scale, 0.016 * scale, (index < 2 ? 0.18 : 0.16) * scale, 5), hoofMaterial)
    );
    leg.position.set(x * scale, 0.04 * scale, z * scale);
    group.add(leg);
  }

  group.add(body, bodyPuffA, bodyPuffB, bodyPuffC, rumpPuff, neck, head, muzzle, earLeft, earRight, eyeLeft, eyeRight, tail);
  return group;
}

function createReliefAnchors(
  tile: MatchSnapshot["board"]["tiles"][number],
  count: number,
  minRadius: number,
  maxRadius: number,
  minScale: number,
  maxScale: number,
  seedSuffix = "main",
  options: ReliefAnchorOptions = {}
): ReliefAnchor[] {
  const random = createTileRandom(`${tile.id}:${tile.q}:${tile.r}:${tile.resource}:${seedSuffix}`);
  const anchors: ReliefAnchor[] = [];
  const occupied = options.occupied ?? [];
  const minGap = options.minGap ?? 0.18;
  const footprintScale = options.footprintScale ?? 0.56;
  const radialBias = options.radialBias ?? 0.78;
  const stretchZ = options.stretchZ ?? 0.9;
  const candidatesPerAnchor = options.candidatesPerAnchor ?? 12;

  for (let index = 0; index < count; index += 1) {
    let bestAnchor: (ReliefAnchor & { footprint: number; clearance: number }) | null = null;

    for (let candidateIndex = 0; candidateIndex < candidatesPerAnchor; candidateIndex += 1) {
      const angle = random() * Math.PI * 2;
      const radius = minRadius + Math.pow(random(), radialBias) * (maxRadius - minRadius);
      const scale = minScale + random() * (maxScale - minScale);
      const footprint = Math.max(scale * footprintScale, 0.12);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * stretchZ;
      let nearestClearance = Number.POSITIVE_INFINITY;

      for (const area of occupied) {
        const clearance = Math.hypot(x - area.x, z - area.z) - area.radius - footprint;
        if (clearance < nearestClearance) {
          nearestClearance = clearance;
        }
      }

      if (nearestClearance < 0) {
        continue;
      }

      if (!bestAnchor || nearestClearance > bestAnchor.clearance) {
        bestAnchor = {
          x,
          z,
          scale,
          angle: angle + (random() - 0.5) * 0.6,
          footprint,
          clearance: nearestClearance
        };
      }
    }

    if (!bestAnchor) {
      continue;
    }

    anchors.push({
      x: bestAnchor.x,
      z: bestAnchor.z,
      scale: bestAnchor.scale,
      angle: bestAnchor.angle
    });
    if (options.occupied) {
      occupied.push({
        x: bestAnchor.x,
        z: bestAnchor.z,
        radius: bestAnchor.footprint + Math.max(minGap * 0.12, 0.04)
      });
    }
  }

  return anchors;
}

function createReliefOccupancy(centerClearRadius = RELIEF_TOKEN_CLEAR_RADIUS): ReliefOccupiedArea[] {
  return [{ x: 0, z: 0, radius: centerClearRadius }];
}

function markTileShadow<T extends THREE.Object3D>(object: T): T {
  object.userData.castTileShadow = true;
  return object;
}

function markTileShadowReceiver<T extends THREE.Object3D>(object: T): T {
  object.userData.receiveTileShadow = true;
  return object;
}

function applyTileMeshShadowState(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    object.castShadow = object.userData.castTileShadow === true;
    object.receiveShadow = object.userData.receiveTileShadow === true;
  });
}

function createTileRandom(seed: string): () => number {
  let state = hashTileSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashTileSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createUltraTileOverlayMaterial(
  terrainBundle: UltraTerrainTextureBundle,
  active: boolean,
  reducedMotion: boolean,
  animateOverlay: boolean
): UltraTileOverlayMaterial {
  const motionBase = animateOverlay ? terrainBundle.appearance.overlayMotion : 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: terrainBundle.overlayMask },
      uBaseColor: { value: new THREE.Color(terrainBundle.appearance.overlayBase) },
      uAccentColor: {
        value: new THREE.Color(active ? shadeColor(terrainBundle.appearance.overlayAccent, 0.08) : terrainBundle.appearance.overlayAccent)
      },
      uTime: { value: 0 },
      uOpacity: { value: terrainBundle.appearance.overlayOpacity + (active ? 0.08 : 0) },
      uMotionScale: { value: motionBase * (reducedMotion ? 0.12 : 1) },
      uStyleIndex: { value: terrainBundle.appearance.styleIndex }
    },
    vertexShader: ULTRA_TILE_OVERLAY_VERTEX_SHADER,
    fragmentShader: ULTRA_TILE_OVERLAY_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false
  }) as UltraTileOverlayMaterial;
  material.userData.motionBase = motionBase;
  return material;
}

function createPortMarker(
  port: MatchSnapshot["board"]["ports"][number],
  edge: MatchSnapshot["board"]["edges"][number],
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>
): THREE.Group {
  const palette = getPortMarkerPalette(port.type);
  const [leftId, rightId] = edge.vertexIds;
  const left = verticesById.get(leftId)!;
  const right = verticesById.get(rightId)!;
  const edgeCenter = new THREE.Vector3((left.x + right.x) / 2, TILE_HEIGHT + 0.12, (left.y + right.y) / 2);
  const outward = new THREE.Vector3(edgeCenter.x - tile.x, 0, edgeCenter.z - tile.y).normalize();
  const sideways = new THREE.Vector3(-outward.z, 0, outward.x).normalize();
  const markerPosition = edgeCenter.clone().add(outward.clone().multiplyScalar(PORT_MARKER_DISTANCE));
  const bridgePosition = edgeCenter.clone().add(outward.clone().multiplyScalar(PORT_MARKER_DISTANCE * 0.42));
  const bridgeLength = PORT_MARKER_DISTANCE * 0.6;

  const marker = new THREE.Group();

  const bridge = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, Math.max(bridgeLength, 0.34), 4, 8),
    new THREE.MeshStandardMaterial({
      color: palette.bridge,
      roughness: 0.52,
      metalness: 0.06,
      transparent: true,
      opacity: 0.98,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.12
    })
  );
  bridge.position.copy(bridgePosition);
  bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward.clone());
  bridge.castShadow = false;
  bridge.receiveShadow = true;

  const dockBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.12, 0.18, 6),
    new THREE.MeshStandardMaterial({
      color: palette.base,
      roughness: 0.78,
      metalness: 0.04,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: port.type === "generic" ? 0.12 : 0.18
    })
  );
  dockBase.position.set(markerPosition.x, TILE_HEIGHT + 0.12, markerPosition.z);
  dockBase.rotation.y = Math.atan2(outward.x, outward.z) + Math.PI / 6;

  const dockTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.84, 0.92, 0.1, 6),
    new THREE.MeshStandardMaterial({
      color: palette.top,
      roughness: 0.42,
      metalness: 0.04,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: port.type === "generic" ? 0.04 : 0.1
    })
  );
  dockTop.position.set(markerPosition.x, TILE_HEIGHT + 0.24, markerPosition.z);
  dockTop.rotation.y = dockBase.rotation.y;

  const createBollard = (offset: number) => {
    const bollard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, 0.28, 10),
      new THREE.MeshStandardMaterial({
        color: palette.bollard,
        roughness: 0.72,
        metalness: 0.08
      })
    );
    const position = markerPosition
      .clone()
      .add(sideways.clone().multiplyScalar(offset))
      .add(outward.clone().multiplyScalar(-0.14));
    bollard.position.set(position.x, TILE_HEIGHT + 0.34, position.z);
    return bollard;
  };

  const signPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.76, 8),
    new THREE.MeshStandardMaterial({
      color: palette.bollard,
      roughness: 0.62,
      metalness: 0.08,
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 0.08
    })
  );
  signPost.position.set(markerPosition.x, TILE_HEIGHT + 0.6, markerPosition.z);

  const badge = createPortSprite(port.type);
  badge.position.set(markerPosition.x, TILE_HEIGHT + 1.12, markerPosition.z);

  const hitArea = new THREE.Mesh(
    new THREE.CylinderGeometry(1.48, 1.48, 2.1, 12),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0
    })
  );
  hitArea.position.set(markerPosition.x, TILE_HEIGHT + 1.02, markerPosition.z);
  hitArea.userData.skipInteractiveVisualState = true;

  marker.add(bridge, dockBase, dockTop, createBollard(-0.34), createBollard(0.34), signPost, badge, hitArea);
  return marker;
}

function createPortSprite(type: PortType): THREE.Sprite {
  const palette = getPortMarkerPalette(type);
  const canvas = document.createElement("canvas");
  canvas.width = 152;
  canvas.height = 152;
  const context = canvas.getContext("2d")!;

  const gradient = context.createRadialGradient(76, 50, 18, 76, 76, 74);
  gradient.addColorStop(0, palette.badgeCore);
  gradient.addColorStop(1, palette.badgeOuter);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(76, 76, 66, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = palette.badgeRing;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(76, 76, 64, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = palette.badgeInnerRing;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(76, 76, 54, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.fillStyle = palette.badgeInset;
  context.arc(76, 76, 38, 0, Math.PI * 2);
  context.fill();

  if (type !== "generic") {
    context.beginPath();
    context.fillStyle = "rgba(255, 255, 255, 0.14)";
    context.arc(110, 42, 18, 0, Math.PI * 2);
    context.fill();
    drawResourceIcon(context, type, 110, 42, 22, getResourceIconColor(type));
  }

  drawHarborIcon(context, 76, 82, 54, "#f5edd6");

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
  );
  sprite.scale.set(2.92, 2.92, 1);
  sprite.renderOrder = 9;
  return sprite;
}

function getPortMarkerPalette(type: PortType): {
  base: string;
  top: string;
  bridge: string;
  bollard: string;
  emissive: string;
  badgeOuter: string;
  badgeCore: string;
  badgeRing: string;
  badgeInnerRing: string;
  badgeInset: string;
  accent: string;
} {
  if (type === "generic") {
    return {
      base: "#173246",
      top: "#f2e4bc",
      bridge: "#ecdcae",
      bollard: "#38556a",
      emissive: "#b98f42",
      badgeOuter: "rgba(9, 18, 27, 0.98)",
      badgeCore: "rgba(19, 36, 49, 0.98)",
      badgeRing: "rgba(232, 210, 158, 0.82)",
      badgeInnerRing: "rgba(255, 255, 255, 0.08)",
      badgeInset: "rgba(240, 222, 174, 0.14)",
      accent: "#f0deae"
    };
  }

  const accent = getResourceIconColor(type);
  const terrain = TILE_COLORS[type];
  return {
    base: shadeColor(terrain, -0.12),
    top: terrain,
    bridge: shadeColor(terrain, 0.04),
    bollard: shadeColor(terrain, -0.06),
    emissive: shadeColor(terrain, -0.14),
    badgeOuter: shadeColor(terrain, -0.12),
    badgeCore: terrain,
    badgeRing: shadeColor(accent, 0.02),
    badgeInnerRing: "rgba(255, 255, 255, 0.14)",
    badgeInset: "rgba(255, 255, 255, 0.12)",
    accent: terrain
  };
}

function getPortTooltip(type: PortType): { title: string; detail: string; accentColor: string } {
  const palette = getPortMarkerPalette(type);
  if (type === "generic") {
    return {
      title: "3:1-Hafen",
      detail: "Tausche 3 gleiche Rohstoffe gegen 1 beliebigen Rohstoff, wenn deine Siedlung oder Stadt an diesem Hafen liegt.",
      accentColor: palette.accent
    };
  }

  const resourceLabel = renderResourceLabel(type);
  return {
    title: `${resourceLabel}-Hafen`,
    detail: `Tausche 2 ${resourceLabel} gegen 1 beliebigen Rohstoff, wenn deine Siedlung oder Stadt an diesem Hafen liegt.`,
    accentColor: palette.accent
  };
}

function drawHarborIcon(
  context: CanvasRenderingContext2D,
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
  context.lineWidth = 1.9;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.arc(0, -7.6, 2.8, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(0, -4.7);
  context.lineTo(0, 8.1);
  context.moveTo(-5.8, -1.1);
  context.lineTo(5.8, -1.1);
  context.moveTo(0, 8.1);
  context.quadraticCurveTo(-7.1, 7.4, -7.7, 1.7);
  context.lineTo(-4.9, 1.7);
  context.moveTo(0, 8.1);
  context.quadraticCurveTo(7.1, 7.4, 7.7, 1.7);
  context.lineTo(4.9, 1.7);
  context.stroke();

  context.restore();
}

function createTileOutline(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>
): THREE.LineLoop {
  const points = tile.vertexIds.map((vertexId) => {
    const vertex = verticesById.get(vertexId)!;
    return new THREE.Vector3(vertex.x - tile.x, 0, vertex.y - tile.y);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({
      color: "#172838",
      transparent: true,
      opacity: 0.1
    })
  );
}

function createTileShape(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  scale = 1
): THREE.Shape {
  const shape = new THREE.Shape();
  tile.vertexIds.forEach((vertexId, index) => {
    const vertex = verticesById.get(vertexId)!;
    const x = (vertex.x - tile.x) * scale;
    const y = (vertex.y - tile.y) * scale;
    if (index === 0) {
      shape.moveTo(x, y);
      return;
    }
    shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function remapPlanarTileUvs(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute("position");
  if (!(position instanceof THREE.BufferAttribute) || position.itemSize < 3) {
    return;
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    return;
  }

  const width = Math.max(bounds.max.x - bounds.min.x, 0.001);
  const depth = Math.max(bounds.max.z - bounds.min.z, 0.001);
  const uvValues = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    uvValues[index * 2] = (position.getX(index) - bounds.min.x) / width;
    uvValues[index * 2 + 1] = (position.getZ(index) - bounds.min.z) / depth;
  }

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvValues, 2));
}

function createRoadPiece(length: number, color: string, selected: boolean): THREE.Mesh {
  const roadLength = Math.max(length * 0.84 - BUILT_ROAD_RADIUS * 2, 0.1);
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(BUILT_ROAD_RADIUS, roadLength, 4, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.03,
      emissive: selected ? new THREE.Color("#ffbf4d") : new THREE.Color("#000000"),
      emissiveIntensity: selected ? 0.42 : 0
    })
  );
}

function createRoadGuide(length: number, selected: boolean): THREE.Mesh {
  const guideLength = Math.max(length * 0.8 - GUIDE_ROAD_RADIUS * 2, 0.1);
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(GUIDE_ROAD_RADIUS, guideLength, 4, 10),
    new THREE.MeshStandardMaterial({
      color: selected ? "#ffd68a" : "#f5d06f",
      roughness: 0.48,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.98 : 0.76,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.48 : 0.28
    })
  );
}

function createRoadHitArea(length: number): THREE.Mesh {
  const hitLength = Math.max(length * 0.96, 1.2);
  const hitArea = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.62, hitLength, 4, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  hitArea.userData.skipInteractiveVisualState = true;
  return hitArea;
}

function appendFocusMarkers(
  group: THREE.Group,
  snapshot: MatchSnapshot,
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  cue: BoardFocusCue,
  pulseObjects: THREE.Object3D[]
): void {
  const focusGroup = new THREE.Group();
  const tileSet = new Set(cue.tileIds);
  const edgeSet = new Set(cue.edgeIds);
  const vertexSet = new Set(cue.vertexIds);

  for (const tileId of tileSet) {
    const tile = snapshot.board.tiles.find((entry) => entry.id === tileId);
    if (!tile) {
      continue;
    }

    const marker = createTileFocusMarker(tile, verticesById, cue.mode === "event");
    marker.position.set(tile.x, TILE_HEIGHT + 0.52, tile.y);
    focusGroup.add(marker);
    registerPulseVisual(marker, pulseObjects, cue.mode === "event" ? "strong" : "soft", 1.12);
  }

  for (const edgeId of edgeSet) {
    const edge = snapshot.board.edges.find((entry) => entry.id === edgeId);
    if (!edge) {
      continue;
    }

    const [leftId, rightId] = edge.vertexIds;
    const left = verticesById.get(leftId);
    const right = verticesById.get(rightId);
    if (!left || !right) {
      continue;
    }

    const marker = createEdgeFocusMarker(left, right, cue.mode === "event");
    focusGroup.add(marker);
    registerPulseVisual(marker, pulseObjects, cue.mode === "event" ? "strong" : "soft", 1.12);
  }

  for (const vertexId of vertexSet) {
    const vertex = verticesById.get(vertexId);
    if (!vertex) {
      continue;
    }

    const marker = createVertexFocusMarker(cue.mode === "event");
    marker.position.set(vertex.x, TILE_HEIGHT + 0.42, vertex.y);
    focusGroup.add(marker);
    registerPulseVisual(marker, pulseObjects, cue.mode === "event" ? "strong" : "soft", 1.12);
  }

  group.add(focusGroup);
}

function createTileFocusMarker(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  strong: boolean
): THREE.Mesh {
  const radius = tile.vertexIds.reduce((sum, vertexId) => {
    const vertex = verticesById.get(vertexId)!;
    return sum + Math.hypot(vertex.x - tile.x, vertex.y - tile.y);
  }, 0) / Math.max(tile.vertexIds.length, 1);
  const material = new THREE.MeshBasicMaterial({
    color: strong ? "#ffd88a" : "#b1dcff",
    transparent: true,
    opacity: strong ? 0.78 : 0.62
  });
  const marker = new THREE.Mesh(new THREE.TorusGeometry(Math.max(radius * 0.76, 2.6), 0.18, 12, 48), material);
  marker.rotation.x = Math.PI / 2;
  marker.userData.baseScale = marker.scale.clone();
  marker.userData.material = material;
  marker.userData.pulseIntensity = strong ? "strong" : "soft";
  return marker;
}

function createEdgeFocusMarker(
  left: MatchSnapshot["board"]["vertices"][number],
  right: MatchSnapshot["board"]["vertices"][number],
  strong: boolean
): THREE.Mesh {
  const dx = right.x - left.x;
  const dz = right.y - left.y;
  const length = Math.sqrt(dx * dx + dz * dz);
  const markerLength = Math.max(length * 0.8 - 0.14, 0.8);
  const material = new THREE.MeshBasicMaterial({
    color: strong ? "#ffd88a" : "#b1dcff",
    transparent: true,
    opacity: strong ? 0.8 : 0.62
  });
  const marker = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, markerLength, 4, 10), material);
  marker.position.set((left.x + right.x) / 2, TILE_HEIGHT + 0.34, (left.y + right.y) / 2);
  marker.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, 0, dz).normalize()
  );
  marker.userData.baseScale = marker.scale.clone();
  marker.userData.material = material;
  marker.userData.pulseIntensity = strong ? "strong" : "soft";
  return marker;
}

function createVertexFocusMarker(strong: boolean): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: strong ? "#ffd88a" : "#b1dcff",
    transparent: true,
    opacity: strong ? 0.82 : 0.64
  });
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 10, 36), material);
  marker.rotation.x = Math.PI / 2;
  marker.userData.baseScale = marker.scale.clone();
  marker.userData.material = material;
  marker.userData.pulseIntensity = strong ? "strong" : "soft";
  return marker;
}

function resolveFocusCuePosition(
  snapshot: MatchSnapshot,
  cue: BoardFocusCue
): FocusGeometry {
  const verticesById = new Map(snapshot.board.vertices.map((vertex) => [vertex.id, vertex]));
  const positions: Array<{ x: number; z: number }> = [];

  for (const tileId of cue.tileIds) {
    const tile = snapshot.board.tiles.find((entry) => entry.id === tileId);
    if (tile) {
      for (const vertexId of tile.vertexIds) {
        const vertex = verticesById.get(vertexId);
        if (vertex) {
          positions.push({ x: vertex.x, z: vertex.y });
        }
      }
    }
  }

  for (const edgeId of cue.edgeIds) {
    const edge = snapshot.board.edges.find((entry) => entry.id === edgeId);
    if (!edge) {
      continue;
    }

    const [leftId, rightId] = edge.vertexIds;
    const left = verticesById.get(leftId);
    const right = verticesById.get(rightId);
    if (!left || !right) {
      continue;
    }

    positions.push({
      x: (left.x + right.x) / 2,
      z: (left.y + right.y) / 2
    });
  }

  for (const vertexId of cue.vertexIds) {
    const vertex = verticesById.get(vertexId);
    if (vertex) {
      positions.push({ x: vertex.x, z: vertex.y });
    }
  }

  if (!positions.length) {
    return { x: 0, z: 0, span: 0 };
  }

  const aggregate = positions.reduce(
    (current, position) => ({
      x: current.x + position.x,
      z: current.z + position.z
    }),
    { x: 0, z: 0 }
  );

  const bounds = positions.reduce(
    (current, position) => ({
      minX: Math.min(current.minX, position.x),
      maxX: Math.max(current.maxX, position.x),
      minZ: Math.min(current.minZ, position.z),
      maxZ: Math.max(current.maxZ, position.z)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY
    }
  );

  return {
    x: aggregate.x / positions.length,
    z: aggregate.z / positions.length,
    span: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
  };
}

function shadeColor(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}

function getTileOuterSideColor(resource: Resource | "desert"): string {
  return shadeColor(TILE_COLORS[resource], -0.06);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function disposeObjectTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      disposeMaterial(object.material, textures);
    }

    if (object instanceof THREE.Sprite) {
      disposeMaterial(object.material, textures);
    }

    if (object instanceof THREE.Line) {
      object.geometry.dispose();
      disposeMaterial(object.material, textures);
    }
  });

  textures.forEach((texture) => texture.dispose());
}

function colorToHex(color: string): string {
  const mapping: Record<string, string> = {
    red: "#d75a4a",
    blue: "#4f78d7",
    white: "#e8e8ea",
    orange: "#eb8e47"
  };
  return mapping[color] ?? color;
}

function resolveInteractiveObject(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current) {
    if (current.userData?.interactiveMeta) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function attachInteractiveMeta(
  object: THREE.Object3D,
  kind: InteractiveMeta["kind"],
  id: string,
  hoverScale: number,
  marker?: THREE.Object3D | null
): void {
  object.userData.kind = kind;
  object.userData.id = id;
  object.userData.interactiveMeta = {
    kind,
    id,
    baseScale: object.scale.clone(),
    hoverScale,
    materialStates: collectMaterialStates(object),
    ...(marker ? { marker } : {})
  } satisfies InteractiveMeta;
}

function clearInteractiveMeta(object: THREE.Object3D): void {
  const meta = object.userData.interactiveMeta as InteractiveMeta | undefined;
  if (!meta) {
    return;
  }

  object.scale.copy(meta.baseScale);
  delete object.userData.interactiveMeta;
  delete object.userData.kind;
  delete object.userData.id;
  delete object.userData.hovered;
}

function registerPulseVisual(
  object: THREE.Object3D,
  pulseObjects: THREE.Object3D[],
  intensity: "soft" | "strong",
  hoverScaleMultiplier: number
): void {
  object.userData.baseScale = object.scale.clone();
  object.userData.materialStates = collectMaterialStates(object);
  object.userData.pulseIntensity = intensity;
  object.userData.hoverScaleMultiplier = hoverScaleMultiplier;
  pulseObjects.push(object);
}

function setInteractiveHoverState(object: THREE.Object3D | null, hovered: boolean): void {
  if (!object) {
    return;
  }

  const meta = object.userData.interactiveMeta as InteractiveMeta | undefined;
  if (!meta) {
    return;
  }

  object.userData.hovered = hovered;
  object.scale.copy(meta.baseScale).multiplyScalar(hovered ? meta.hoverScale : 1);

  for (const state of meta.materialStates) {
    if (typeof state.opacity === "number") {
      state.material.opacity = hovered ? Math.min(state.opacity + 0.3, 1) : state.opacity;
    }
    if (typeof state.emissiveIntensity === "number" && "emissiveIntensity" in state.material) {
      state.material.emissiveIntensity = hovered ? state.emissiveIntensity + 0.34 : state.emissiveIntensity;
    }
    if (state.color && "color" in state.material && state.material.color instanceof THREE.Color) {
      state.material.color.copy(
        hovered ? state.color.clone().lerp(new THREE.Color("#ffe6a6"), 0.28) : state.color
      );
    }
  }

  if (meta.marker) {
    meta.marker.userData.hovered = hovered;
  }
}

function collectMaterialStates(root: THREE.Object3D): MaterialState[] {
  const states: MaterialState[] = [];

  root.traverse((object) => {
    if (object.userData?.skipInteractiveVisualState) {
      return;
    }

    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const state: MaterialState = {
        material
      };

      if ("opacity" in material && typeof material.opacity === "number") {
        state.opacity = material.opacity;
      }

      if ("emissiveIntensity" in material && typeof material.emissiveIntensity === "number") {
        state.emissiveIntensity = material.emissiveIntensity;
      }

      if ("color" in material && material.color instanceof THREE.Color) {
        state.color = material.color.clone();
      }

      states.push(state);
    }
  });

  return states;
}

function disposeMaterial(
  material: THREE.Material | THREE.Material[] | THREE.SpriteMaterial,
  textures: Set<THREE.Texture>
): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    collectTexturesFromMaterial(entry, textures);
    entry.dispose();
  }
}

function collectTexturesFromMaterial(material: THREE.Material, textures: Set<THREE.Texture>): void {
  const textureKeys = [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "gradientMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
    "specularMap"
  ] as const;
  type TextureMaterialKey = (typeof textureKeys)[number];
  const textureMaterial = material as unknown as Partial<Record<TextureMaterialKey, THREE.Texture | null | undefined>>;

  for (const key of textureKeys) {
    const value = textureMaterial[key];
    if (value) {
      textures.add(value);
    }
  }

  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      const value = uniform?.value;
      if (value instanceof THREE.Texture) {
        textures.add(value);
      }
    }
  }
}
