import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MatchSnapshot, PortType, Resource } from "@hexagonia/shared";
import { createUltraTerrainTextureBundle, type UltraTerrainTextureBundle } from "./boardUltraTerrain";
import { TILE_COLORS, type BoardVisualProfile } from "./boardVisuals";
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
  visualProfile: BoardVisualProfile;
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

export function BoardScene(props: BoardSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const interactiveRef = useRef<THREE.Object3D[]>([]);
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

    scene.add(new THREE.AmbientLight("#d5e4f2", 1.35));
    const keyLight = new THREE.DirectionalLight("#f6efe0", 1.45);
    keyLight.position.set(24, 36, 16);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#89b9ff", 0.55);
    fillLight.position.set(-20, 18, -20);
    scene.add(fillLight);

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

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

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
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    setBoardTooltip(null);
    if (boardGroupRef.current) {
      setInteractiveHoverState(hoveredInteractiveRef.current, false);
      hoveredInteractiveRef.current = null;
      if (rendererRef.current && !userInteractingRef.current) {
        rendererRef.current.domElement.style.cursor = "";
      }
      disposeObjectTree(boardGroupRef.current);
      scene.remove(boardGroupRef.current);
    }

    const group = new THREE.Group();
    interactiveRef.current = [];
    pulseObjectsRef.current = [];
    ultraAnimatedMaterialsRef.current = [];
    boardGroupRef.current = group;
    scene.add(group);
    const verticesById = new Map(props.snapshot.board.vertices.map((vertex) => [vertex.id, vertex]));
    const tilesById = new Map(props.snapshot.board.tiles.map((tile) => [tile.id, tile]));
    const edgesById = new Map(props.snapshot.board.edges.map((edge) => [edge.id, edge]));

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

    const robberTileIds = new Set(
      props.interactionMode === "robber"
        ? props.snapshot.allowedMoves.robberMoveOptions.map((option) => option.tileId)
        : []
    );
    const ultraTerrainBundles = new Map<Resource | "desert", UltraTerrainTextureBundle>();

    for (const tile of props.snapshot.board.tiles) {
      const active = robberTileIds.has(tile.id);
      if (props.visualProfile === "ultra" && !ultraTerrainBundles.has(tile.resource)) {
        ultraTerrainBundles.set(tile.resource, createUltraTerrainTextureBundle(tile.resource));
      }
      const base =
        props.visualProfile === "ultra"
          ? createUltraTileMesh(
              tile,
              verticesById,
              active,
              ultraTerrainBundles.get(tile.resource)!,
              ultraAnimatedMaterialsRef.current,
              reducedMotionRef.current
            )
          : createModernTileMesh(tile, verticesById, active);
      base.position.set(tile.x, 0, tile.y);
      base.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = true;
        }
      });
      group.add(base);

      const outline = createTileOutline(tile, verticesById);
      outline.position.set(tile.x, TILE_HEIGHT + 0.04, tile.y);
      group.add(outline);

      const tokenSprite = createTokenSprite(tile.resource, tile.token, tile.robber);
      tokenSprite.position.set(tile.x, TILE_HEIGHT + 0.72, tile.y);
      group.add(tokenSprite);

      if (active) {
        const marker = createTileFocusMarker(tile, verticesById, false);
        marker.position.set(tile.x, TILE_HEIGHT + 0.52, tile.y);
        registerPulseVisual(marker, pulseObjectsRef.current, "soft", 1.08);
        group.add(marker);
        attachInteractiveMeta(base, "tile", tile.id, 1.06, marker);
        interactiveRef.current.push(base);
      }
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
      interactiveRef.current.push(marker);
      group.add(marker);
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
      const selected = props.selectedRoadEdges.includes(edge.id);
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
        interactiveRef.current.push(roadObject);
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
      mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
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
        interactiveRef.current.push(mesh);
      }
    }

    if (props.focusCue) {
      appendFocusMarkers(group, props.snapshot, verticesById, props.focusCue, pulseObjectsRef.current);
    }
  }, [props.focusCue, props.interactionMode, props.selectedRoadEdges, props.snapshot, props.visualProfile]);

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
  active: boolean
): THREE.Group {
  const tileTopColor = shadeColor(TILE_COLORS[tile.resource], -0.03);
  const tileSideColor = getTileOuterSideColor(tile.resource);
  const tileInsetTopColor = shadeColor(TILE_COLORS[tile.resource], 0.026);
  const tileInsetSideColor = shadeColor(TILE_COLORS[tile.resource], -0.03);
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

  const outerMesh = new THREE.Mesh(
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
  );

  const insetMesh = new THREE.Mesh(
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
  );
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh);
  tileGroup.add(insetMesh);
  return tileGroup;
}

function createUltraTileMesh(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  active: boolean,
  terrainBundle: UltraTerrainTextureBundle,
  animatedMaterials: UltraTileOverlayMaterial[],
  reducedMotion: boolean
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

  const outerMesh = new THREE.Mesh(outerGeometry, [
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
  ]);

  const insetMesh = new THREE.Mesh(insetGeometry, [
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
  ]);
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const overlayShape = createTileShape(tile, verticesById, 0.928);
  const overlayGeometry = new THREE.ShapeGeometry(overlayShape, 12);
  overlayGeometry.rotateX(-Math.PI / 2);
  const overlayMaterial = createUltraTileOverlayMaterial(terrainBundle, active, reducedMotion);
  animatedMaterials.push(overlayMaterial);
  const overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
  overlayMesh.position.y = TILE_HEIGHT + 0.028;
  overlayMesh.renderOrder = 4;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh);
  tileGroup.add(insetMesh);
  tileGroup.add(overlayMesh);
  return tileGroup;
}

function createUltraTileOverlayMaterial(
  terrainBundle: UltraTerrainTextureBundle,
  active: boolean,
  reducedMotion: boolean
): UltraTileOverlayMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: terrainBundle.overlayMask },
      uBaseColor: { value: new THREE.Color(terrainBundle.appearance.overlayBase) },
      uAccentColor: {
        value: new THREE.Color(active ? shadeColor(terrainBundle.appearance.overlayAccent, 0.08) : terrainBundle.appearance.overlayAccent)
      },
      uTime: { value: 0 },
      uOpacity: { value: terrainBundle.appearance.overlayOpacity + (active ? 0.08 : 0) },
      uMotionScale: { value: terrainBundle.appearance.overlayMotion * (reducedMotion ? 0.12 : 1) },
      uStyleIndex: { value: terrainBundle.appearance.styleIndex }
    },
    vertexShader: ULTRA_TILE_OVERLAY_VERTEX_SHADER,
    fragmentShader: ULTRA_TILE_OVERLAY_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false
  }) as UltraTileOverlayMaterial;
  material.userData.motionBase = terrainBundle.appearance.overlayMotion;
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
    base: shadeColor(terrain, -0.24),
    top: shadeColor(terrain, 0.2),
    bridge: shadeColor(accent, 0.06),
    bollard: shadeColor(terrain, -0.08),
    emissive: accent,
    badgeOuter: shadeColor(terrain, -0.18),
    badgeCore: shadeColor(terrain, 0.04),
    badgeRing: accent,
    badgeInnerRing: "rgba(255, 255, 255, 0.14)",
    badgeInset: "rgba(255, 255, 255, 0.12)",
    accent
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
  return shadeColor(TILE_COLORS[resource], resource === "lumber" ? -0.045 : -0.085);
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
