import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Resource } from "@hexagonia/shared";
import { createUltraTerrainTextureBundle } from "./boardUltraTerrain";
import { BUILT_ROAD_ELEVATION, createBuildingPieceModel, createRoadPieceModel } from "./boardPieceModels";
import { isFirefoxBrowser } from "./browserPerformance";
import { TILE_COLORS } from "./boardVisuals";

interface ShowcaseTile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  resource: Resource | "desert";
  vertexIds: string[];
  edgeIds: string[];
}

interface ShowcaseVertex {
  id: string;
  x: number;
  y: number;
  tileIds: string[];
  edgeIds: string[];
}

interface ShowcaseEdge {
  id: string;
  vertexIds: [string, string];
  tileIds: string[];
}

interface ShowcaseRoad {
  edgeId: string;
  color: string;
}

interface ShowcaseBuilding {
  vertexId: string;
  type: "settlement" | "city";
  color: string;
}

interface ShowcaseBoard {
  tiles: ShowcaseTile[];
  vertices: ShowcaseVertex[];
  edges: ShowcaseEdge[];
  roads: ShowcaseRoad[];
  buildings: ShowcaseBuilding[];
}

type LandingVisualProfile = "classic" | "fancy";
const SHARED_RESOURCE_FLAG = "__sharedResource";
const fancyTilePropTemplateCache = new Map<Resource | "desert", THREE.Group>();
const tileSandGeometryCache = new Map<string, THREE.ShapeGeometry>();
const tileSandMaterial = markSharedResource(
  new THREE.MeshStandardMaterial({
    color: "#e7cf8d",
    roughness: 0.98,
    metalness: 0.01,
    emissive: new THREE.Color("#c6aa62"),
    emissiveIntensity: 0.08
  })
);

const SHOWCASE_PLAYER_COLORS = {
  red: "#cf3b35",
  blue: "#4f78d7",
  orange: "#eb8e47",
  green: "#53b978"
} as const;

const TILE_HEIGHT = 0.82;
const TILE_OUTER_BEVEL_SIZE = 0.18;
const TILE_OUTER_BEVEL_THICKNESS = 0.09;
const TILE_INSET_DEPTH = 0.18;
const TILE_INSET_BEVEL_SIZE = 0.09;
const TILE_INSET_BEVEL_THICKNESS = 0.04;
const TILE_OUTER_RENDER_SCALE = 0.955;
const TILE_INSET_RENDER_SCALE = 0.918;
const TILE_OVERLAY_RENDER_SCALE = 0.895;
const TILE_SAND_UNDERLAY_SCALE = 1;
const TILE_SAND_UNDERLAY_Y = 0.026;
const HEX_RADIUS = 1;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_HEIGHT = 2 * HEX_RADIUS;
const LANDING_BOARD_YAW = 0.32;
const LANDING_CAMERA_BASE_POSITION = new THREE.Vector3(0, 23.5, 39.5);
const LANDING_CAMERA_SCROLL_POSITION_DELTA = new THREE.Vector3(0, 2.2, -4.6);
const LANDING_CAMERA_BASE_TARGET = new THREE.Vector3(0, 1.9, 0);
const LANDING_CAMERA_SCROLL_TARGET_DELTA = new THREE.Vector3(0, 0.7, 0);
const LANDING_AUTO_ROTATE_SPEED = 0.15;
const LANDING_AUTO_ROTATE_SPEED_REDUCED = 0.04;
const LANDING_PRESENTATION_BLEND = 2.9;
const LANDING_PRESENTATION_BLEND_REDUCED = 1.1;
const LANDING_RESET_BLEND = 5.2;
const LANDING_RESET_BLEND_REDUCED = 2.1;
const LANDING_TOUCH_RESET_DELAY_MS = 250;
const LANDING_RESET_POSITION_EPSILON = 0.08;
const LANDING_RESET_TARGET_EPSILON = 0.03;
const X_SCALE = 4.8;
const Y_SCALE = 4.2;
const CORNER_OFFSETS = [
  [Math.cos(-Math.PI / 6), Math.sin(-Math.PI / 6)],
  [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)],
  [Math.cos(Math.PI / 2), Math.sin(Math.PI / 2)],
  [Math.cos((5 * Math.PI) / 6), Math.sin((5 * Math.PI) / 6)],
  [Math.cos((7 * Math.PI) / 6), Math.sin((7 * Math.PI) / 6)],
  [Math.cos((3 * Math.PI) / 2), Math.sin((3 * Math.PI) / 2)]
] as const;

const SHOWCASE_RESOURCE_BY_COORD: Record<string, Resource | "desert"> = {
  "0:-2": "ore",
  "1:-2": "grain",
  "2:-2": "brick",
  "-1:-1": "ore",
  "0:-1": "wool",
  "1:-1": "brick",
  "2:-1": "grain",
  "-2:0": "ore",
  "-1:0": "grain",
  "0:0": "grain",
  "1:0": "desert",
  "2:0": "wool",
  "-2:1": "brick",
  "-1:1": "lumber",
  "0:1": "ore",
  "1:1": "brick",
  "-2:2": "lumber",
  "-1:2": "wool",
  "0:2": "lumber"
};

export function LandingBoardScene(props: { reducedMotion: boolean; visualProfile?: LandingVisualProfile }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hasFallback, setHasFallback] = useState(false);
  const showcaseBoard = useMemo(() => createShowcaseBoard(), []);
  const visualProfile = props.visualProfile ?? "classic";

  useEffect(() => {
    if (hasFallback) {
      return;
    }

    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
    } catch {
      setHasFallback(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#156c97");
    scene.fog = new THREE.Fog("#156c97", 92, 210);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
    const clock = new THREE.Clock(false);
    const boardGroup = new THREE.Group();
    const controls = new OrbitControls(camera, mount);
    const glowMarkers: Array<{ material: THREE.MeshBasicMaterial; speed: number; baseOpacity: number }> = [];
    const firefoxBrowser = isFirefoxBrowser();
    const activeTouchPointers = new Set<number>();
    const idleBasePosition = new THREE.Vector3();
    const idleTarget = new THREE.Vector3();
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const idleOffset = new THREE.Vector3();
    const orbitOffset = new THREE.Vector3();
    const orbitSpherical = new THREE.Spherical();
    let scrollProgress = 0;
    let frameId = 0;
    let elapsed = 0;
    let isSceneVisible = true;
    let isDocumentVisible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
    let isCompactScene = false;
    let isScrollTracking = false;
    let isPointerInside = false;
    let isUserInteracting = false;
    let shouldResetAfterInteraction = false;
    let isResetting = false;
    let isAutoRotating = true;
    let resetDelayUntil = 0;
    let autoRotateAngle = 0;
    let touchOrbitActive = false;

    scene.add(boardGroup);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = "landing-scene-canvas";
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#dce6ea", 1.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight("#f5e8cb", 1.8);
    keyLight.position.set(18, 26, 14);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#6ab6ea", 0.62);
    fillLight.position.set(-14, 12, -14);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight("#f0c373", 2, 54, 2);
    rimLight.position.set(0, 8, 0);
    scene.add(rimLight);

    boardGroup.add(createLandingWaterBackdrop());

    const haloRingMaterial = new THREE.MeshBasicMaterial({
      color: "#0f82ad",
      transparent: true,
      opacity: 0.19
    });
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(26.1, 0.14, 12, 88), haloRingMaterial);
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = 0.01;
    boardGroup.add(haloRing);
    glowMarkers.push({ material: haloRingMaterial, speed: 0.9, baseOpacity: 0.15 });

    const stars = createStarField();
    scene.add(stars);

    const verticesById = new Map(showcaseBoard.vertices.map((vertex) => [vertex.id, vertex]));
    const edgesById = new Map(showcaseBoard.edges.map((edge) => [edge.id, edge]));

    for (const tile of showcaseBoard.tiles) {
      const tileGroup = createTileMesh(tile, verticesById, visualProfile);
      tileGroup.position.set(tile.x, 0, tile.y);
      tileGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = object.userData.landingProp === true;
          object.receiveShadow = true;
        }
      });
      boardGroup.add(tileGroup);

      const outline = createTileOutline(tile, verticesById);
      outline.position.set(tile.x, TILE_HEIGHT + 0.05, tile.y);
      boardGroup.add(outline);
    }

    for (const roadEntry of showcaseBoard.roads) {
      const edge = edgesById.get(roadEntry.edgeId);
      if (!edge) {
        continue;
      }

      const [leftId, rightId] = edge.vertexIds;
      const left = verticesById.get(leftId);
      const right = verticesById.get(rightId);
      if (!left || !right) {
        continue;
      }

      const dx = right.x - left.x;
      const dz = right.y - left.y;
      const length = Math.sqrt(dx * dx + dz * dz);
      const road = createRoadPiece(length, roadEntry.color);
      const roadObject = new THREE.Group();
      roadObject.position.set((left.x + right.x) / 2, TILE_HEIGHT + BUILT_ROAD_ELEVATION, (left.y + right.y) / 2);
      roadObject.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx, 0, dz).normalize());
      road.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      roadObject.add(road);
      boardGroup.add(roadObject);
    }

    for (const buildingEntry of showcaseBoard.buildings) {
      const vertex = verticesById.get(buildingEntry.vertexId);
      if (!vertex) {
        continue;
      }

      const building = createBuildingMesh(buildingEntry.type, buildingEntry.color);
      building.position.set(vertex.x, TILE_HEIGHT + 0.02, vertex.y);
      building.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      boardGroup.add(building);

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: buildingEntry.color,
        transparent: true,
        opacity: 0.3
      });
      const marker = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.11, 10, 36), markerMaterial);
      marker.rotation.x = Math.PI / 2;
      marker.position.set(vertex.x, TILE_HEIGHT + 0.38, vertex.y);
      boardGroup.add(marker);
      glowMarkers.push({ material: markerMaterial, speed: 1.4, baseOpacity: 0.24 });
    }

    const updatePerformanceProfile = () => {
      const coarsePointer =
        typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)").matches : false;
      isCompactScene = coarsePointer || window.innerWidth < 720;
      const maxPixelRatio = firefoxBrowser ? (isCompactScene ? 1 : 1.25) : isCompactScene ? 1.1 : 1.75;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
      renderer.shadowMap.enabled = !isCompactScene;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    };

    const updateSize = () => {
      updatePerformanceProfile();
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const updateScrollProgress = () => {
      const rect = mount.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const progress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
      scrollProgress = THREE.MathUtils.clamp(progress, 0, 1);
    };

    const setCursor = (value: string) => {
      mount.style.cursor = value;
    };

    const applyIdlePose = () => {
      resolveIdlePose(scrollProgress, idleBasePosition, idleTarget);
      camera.position.copy(idleBasePosition);
      controls.target.copy(idleTarget);
      controls.update();
    };

    const setDesktopControlProfile = () => {
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
      mount.style.touchAction = "pan-y";
    };

    const setTouchIdleProfile = () => {
      controls.enablePan = false;
      controls.enableRotate = false;
      controls.enableZoom = false;
      mount.style.touchAction = "pan-y";
    };

    const setTouchCameraProfile = () => {
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.enableZoom = true;
      mount.style.touchAction = "none";
    };

    const clearResetSchedule = () => {
      resetDelayUntil = 0;
    };

    const pausePresentation = () => {
      isAutoRotating = false;
      isResetting = false;
      clearResetSchedule();
    };

    const startReset = (delayMs = 0) => {
      isAutoRotating = false;
      if (delayMs > 0) {
        isResetting = false;
        resetDelayUntil = performance.now() + delayMs;
        return;
      }

      isResetting = true;
      clearResetSchedule();
    };

    const syncTouchControlProfile = () => {
      if (activeTouchPointers.size >= 2) {
        if (!touchOrbitActive) {
          touchOrbitActive = true;
          pausePresentation();
        }
        setTouchCameraProfile();
        return;
      }

      if (touchOrbitActive) {
        touchOrbitActive = false;
        shouldResetAfterInteraction = false;
        startReset(LANDING_TOUCH_RESET_DELAY_MS);
      }

      if (activeTouchPointers.size === 1) {
        setTouchIdleProfile();
        return;
      }

      setDesktopControlProfile();
    };

    const handlePointerEnter = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      isPointerInside = true;
      if (!isUserInteracting && !touchOrbitActive) {
        pausePresentation();
      }
      setCursor("grab");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      const rect = mount.getBoundingClientRect();
      const isInsideBounds =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isInsideBounds) {
        isPointerInside = true;
        if (!isUserInteracting) {
          setCursor("grab");
        }
        return;
      }

      isPointerInside = false;
      if (isUserInteracting) {
        shouldResetAfterInteraction = true;
      }
    };

    const handlePointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      isPointerInside = false;
      if (isUserInteracting) {
        shouldResetAfterInteraction = true;
        return;
      }

      setCursor("");
      startReset();
    };

    const handlePointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      activeTouchPointers.add(event.pointerId);
      syncTouchControlProfile();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      activeTouchPointers.delete(event.pointerId);
      syncTouchControlProfile();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const animate = () => {
      frameId = 0;
      if (!isSceneVisible || !isDocumentVisible) {
        return;
      }

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      const motionScale = props.reducedMotion ? 0.28 : 1;
      boardGroup.rotation.y = LANDING_BOARD_YAW;
      boardGroup.position.y = props.reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.08;

      glowMarkers.forEach((entry, index) => {
        entry.material.opacity =
          entry.baseOpacity + (props.reducedMotion ? 0 : (Math.sin(elapsed * entry.speed + index * 0.7) + 1) * 0.05);
      });

      haloRing.rotation.z = elapsed * 0.045 * motionScale;
      stars.rotation.y = elapsed * 0.025 * motionScale;

      if (!isUserInteracting) {
        if (!isResetting && resetDelayUntil > 0 && performance.now() >= resetDelayUntil) {
          isResetting = true;
          clearResetSchedule();
        }

        resolveIdlePose(scrollProgress, idleBasePosition, idleTarget);
        idleOffset.copy(idleBasePosition).sub(idleTarget);
        orbitSpherical.setFromVector3(idleOffset);

        if (isAutoRotating) {
          autoRotateAngle += delta * (props.reducedMotion ? LANDING_AUTO_ROTATE_SPEED_REDUCED : LANDING_AUTO_ROTATE_SPEED);
          if (autoRotateAngle > Math.PI * 2) {
            autoRotateAngle -= Math.PI * 2;
          }
          orbitSpherical.theta += autoRotateAngle;
          desiredTarget.copy(idleTarget);
          orbitOffset.setFromSpherical(orbitSpherical);
          desiredPosition.copy(idleTarget).add(orbitOffset);
          const presentationBlend = 1 - Math.exp(-delta * (props.reducedMotion ? LANDING_PRESENTATION_BLEND_REDUCED : LANDING_PRESENTATION_BLEND));
          controls.target.lerp(desiredTarget, presentationBlend);
          camera.position.lerp(desiredPosition, presentationBlend);
          controls.update();
        } else if (isResetting) {
          desiredTarget.copy(idleTarget);
          desiredPosition.copy(idleBasePosition);
          const resetBlend = 1 - Math.exp(-delta * (props.reducedMotion ? LANDING_RESET_BLEND_REDUCED : LANDING_RESET_BLEND));
          controls.target.lerp(desiredTarget, resetBlend);
          camera.position.lerp(desiredPosition, resetBlend);
          controls.update();

          if (
            controls.target.distanceToSquared(desiredTarget) < LANDING_RESET_TARGET_EPSILON &&
            camera.position.distanceToSquared(desiredPosition) < LANDING_RESET_POSITION_EPSILON
          ) {
            controls.target.copy(desiredTarget);
            camera.position.copy(desiredPosition);
            controls.update();
            autoRotateAngle = 0;
            isResetting = false;
            isAutoRotating = true;
          }
        }
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (frameId !== 0 || !isSceneVisible || !isDocumentVisible) {
        return;
      }

      clock.start();
      frameId = window.requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      if (frameId === 0) {
        return;
      }

      window.cancelAnimationFrame(frameId);
      clock.stop();
      frameId = 0;
    };

    const enableScrollTracking = () => {
      if (isScrollTracking) {
        return;
      }

      window.addEventListener("scroll", updateScrollProgress, { passive: true });
      isScrollTracking = true;
      updateScrollProgress();
    };

    const disableScrollTracking = () => {
      if (!isScrollTracking) {
        return;
      }

      window.removeEventListener("scroll", updateScrollProgress);
      isScrollTracking = false;
    };

    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState !== "hidden";
      if (isDocumentVisible) {
        startAnimation();
        return;
      }

      stopAnimation();
    };

    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.minDistance = 28;
    controls.maxDistance = 78;
    controls.minPolarAngle = 0.52;
    controls.maxPolarAngle = Math.PI / 2.08;
    setDesktopControlProfile();
    applyIdlePose();

    const handleControlStart = () => {
      isUserInteracting = true;
      shouldResetAfterInteraction = false;
      pausePresentation();
      if (!touchOrbitActive) {
        setCursor("grabbing");
      }
    };

    const handleControlEnd = () => {
      isUserInteracting = false;
      if (!touchOrbitActive && isPointerInside) {
        setCursor("grab");
      } else {
        setCursor("");
      }

      if (shouldResetAfterInteraction || (!isPointerInside && activeTouchPointers.size === 0 && resetDelayUntil === 0)) {
        shouldResetAfterInteraction = false;
        startReset();
      }
    };

    updateSize();
    updateScrollProgress();
    enableScrollTracking();
    startAnimation();
    const sceneVisibilityObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              isSceneVisible = entry?.isIntersecting ?? true;
              if (isSceneVisible) {
                enableScrollTracking();
                updateScrollProgress();
                startAnimation();
                return;
              }

              disableScrollTracking();
              stopAnimation();
            },
            {
              root: null,
              threshold: 0.02
            }
          );

    window.addEventListener("resize", updateSize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    controls.addEventListener("start", handleControlStart);
    controls.addEventListener("end", handleControlEnd);
    sceneVisibilityObserver?.observe(mount);
    mount.addEventListener("pointerenter", handlePointerEnter);
    mount.addEventListener("pointermove", handlePointerMove);
    mount.addEventListener("pointerleave", handlePointerLeave);
    mount.addEventListener("pointerdown", handlePointerDownCapture, true);
    mount.addEventListener("pointerup", handlePointerUp);
    mount.addEventListener("pointercancel", handlePointerUp);
    mount.addEventListener("contextmenu", handleContextMenu);

    return () => {
      stopAnimation();
      disableScrollTracking();
      window.removeEventListener("resize", updateSize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controls.removeEventListener("start", handleControlStart);
      controls.removeEventListener("end", handleControlEnd);
      sceneVisibilityObserver?.disconnect();
      mount.removeEventListener("pointerenter", handlePointerEnter);
      mount.removeEventListener("pointermove", handlePointerMove);
      mount.removeEventListener("pointerleave", handlePointerLeave);
      mount.removeEventListener("pointerdown", handlePointerDownCapture, true);
      mount.removeEventListener("pointerup", handlePointerUp);
      mount.removeEventListener("pointercancel", handlePointerUp);
      mount.removeEventListener("contextmenu", handleContextMenu);
      mount.style.touchAction = "";
      mount.style.cursor = "";
      controls.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      mount.replaceChildren();
    };
  }, [hasFallback, props.reducedMotion, showcaseBoard, visualProfile]);

  if (hasFallback) {
    return (
      <div className="landing-scene-fallback" aria-hidden="true">
        <span className="landing-fallback-glow" />
        <span className="landing-fallback-hex is-center" />
        <span className="landing-fallback-hex is-left" />
        <span className="landing-fallback-hex is-right" />
        <span className="landing-fallback-hex is-top-left" />
        <span className="landing-fallback-hex is-top-right" />
        <span className="landing-fallback-road is-a" />
        <span className="landing-fallback-road is-b" />
      </div>
    );
  }

  return <div ref={mountRef} className="landing-scene-stage" aria-hidden="true" />;
}

function resolveIdlePose(scrollProgress: number, position: THREE.Vector3, target: THREE.Vector3): void {
  position.copy(LANDING_CAMERA_BASE_POSITION).addScaledVector(LANDING_CAMERA_SCROLL_POSITION_DELTA, scrollProgress);
  target.copy(LANDING_CAMERA_BASE_TARGET).addScaledVector(LANDING_CAMERA_SCROLL_TARGET_DELTA, scrollProgress);
}

function createShowcaseBoard(): ShowcaseBoard {
  const tileCoords = createRadiusTwoCoords();
  const vertexByKey = new Map<string, ShowcaseVertex>();
  const edgeByKey = new Map<string, ShowcaseEdge>();
  const verticesById = new Map<string, ShowcaseVertex>();
  const tiles: ShowcaseTile[] = [];

  for (const [tileIndex, coord] of tileCoords.entries()) {
    const tileId = `tile-${tileIndex}`;
    const [cx, cy] = axialToWorld(coord.q, coord.r);
    const vertexIds: string[] = [];
    const edgeIds: string[] = [];

    for (let cornerIndex = 0; cornerIndex < CORNER_OFFSETS.length; cornerIndex += 1) {
      const offset = CORNER_OFFSETS[cornerIndex]!;
      const vx = round4(cx + offset[0] * HEX_RADIUS);
      const vy = round4(cy + offset[1] * HEX_RADIUS);
      const vertexKey = `${vx}:${vy}`;

      if (!vertexByKey.has(vertexKey)) {
        const vertexId = `vertex-${vertexByKey.size}`;
        const vertex: ShowcaseVertex = {
          id: vertexId,
          x: vx * X_SCALE,
          y: vy * Y_SCALE,
          tileIds: [],
          edgeIds: []
        };
        vertexByKey.set(vertexKey, vertex);
        verticesById.set(vertex.id, vertex);
      }

      const vertex = vertexByKey.get(vertexKey)!;
      vertex.tileIds.push(tileId);
      vertexIds.push(vertex.id);
    }

    for (let cornerIndex = 0; cornerIndex < vertexIds.length; cornerIndex += 1) {
      const a = vertexIds[cornerIndex]!;
      const b = vertexIds[(cornerIndex + 1) % vertexIds.length]!;
      const edgeKey = [a, b].sort().join("|");

      if (!edgeByKey.has(edgeKey)) {
        const edgeId = `edge-${edgeByKey.size}`;
        edgeByKey.set(edgeKey, {
          id: edgeId,
          vertexIds: [a, b],
          tileIds: []
        });
      }

      const edge = edgeByKey.get(edgeKey)!;
      edge.tileIds.push(tileId);
      edgeIds.push(edge.id);
    }

    tiles.push({
      id: tileId,
      q: coord.q,
      r: coord.r,
      x: round4(cx * X_SCALE),
      y: round4(cy * Y_SCALE),
      resource: SHOWCASE_RESOURCE_BY_COORD[`${coord.q}:${coord.r}`] ?? "grain",
      vertexIds,
      edgeIds
    });
  }

  const edges = [...edgeByKey.values()];
  for (const edge of edges) {
    const [a, b] = edge.vertexIds;
    const left = verticesById.get(a)!;
    const right = verticesById.get(b)!;
    left.edgeIds.push(edge.id);
    right.edgeIds.push(edge.id);
  }

  const tilesByCoord = new Map(tiles.map((tile) => [`${tile.q}:${tile.r}`, tile]));
  const centerTile = tilesByCoord.get("0:0");
  const eastTile = tilesByCoord.get("1:0");
  const southWestTile = tilesByCoord.get("-1:1");
  const southTile = tilesByCoord.get("0:1");
  const northTile = tilesByCoord.get("0:-1");
  const westTile = tilesByCoord.get("-1:0");
  const farEastTile = tilesByCoord.get("2:0");

  if (!centerTile || !eastTile || !southWestTile || !southTile || !northTile || !westTile || !farEastTile) {
    throw new Error("Landing showcase board is incomplete.");
  }

  return {
    tiles,
    vertices: [...verticesById.values()],
    edges,
    roads: uniqueRoads([
      { edgeId: centerTile.edgeIds[0]!, color: SHOWCASE_PLAYER_COLORS.red },
      { edgeId: centerTile.edgeIds[1]!, color: SHOWCASE_PLAYER_COLORS.red },
      { edgeId: southTile.edgeIds[5]!, color: SHOWCASE_PLAYER_COLORS.red },
      { edgeId: southTile.edgeIds[0]!, color: SHOWCASE_PLAYER_COLORS.red },
      { edgeId: centerTile.edgeIds[2]!, color: SHOWCASE_PLAYER_COLORS.blue },
      { edgeId: southWestTile.edgeIds[0]!, color: SHOWCASE_PLAYER_COLORS.blue },
      { edgeId: southWestTile.edgeIds[1]!, color: SHOWCASE_PLAYER_COLORS.blue },
      { edgeId: southWestTile.edgeIds[4]!, color: SHOWCASE_PLAYER_COLORS.blue },
      { edgeId: eastTile.edgeIds[4]!, color: SHOWCASE_PLAYER_COLORS.orange },
      { edgeId: eastTile.edgeIds[5]!, color: SHOWCASE_PLAYER_COLORS.orange },
      { edgeId: farEastTile.edgeIds[0]!, color: SHOWCASE_PLAYER_COLORS.orange },
      { edgeId: farEastTile.edgeIds[1]!, color: SHOWCASE_PLAYER_COLORS.orange },
      { edgeId: northTile.edgeIds[0]!, color: SHOWCASE_PLAYER_COLORS.green },
      { edgeId: northTile.edgeIds[1]!, color: SHOWCASE_PLAYER_COLORS.green },
      { edgeId: westTile.edgeIds[2]!, color: SHOWCASE_PLAYER_COLORS.green },
      { edgeId: westTile.edgeIds[3]!, color: SHOWCASE_PLAYER_COLORS.green }
    ]),
    buildings: [
      { vertexId: centerTile.vertexIds[1]!, type: "city", color: SHOWCASE_PLAYER_COLORS.red },
      { vertexId: southTile.vertexIds[1]!, type: "settlement", color: SHOWCASE_PLAYER_COLORS.red },
      { vertexId: centerTile.vertexIds[3]!, type: "settlement", color: SHOWCASE_PLAYER_COLORS.blue },
      { vertexId: southWestTile.vertexIds[2]!, type: "city", color: SHOWCASE_PLAYER_COLORS.blue },
      { vertexId: eastTile.vertexIds[5]!, type: "settlement", color: SHOWCASE_PLAYER_COLORS.orange },
      { vertexId: farEastTile.vertexIds[1]!, type: "city", color: SHOWCASE_PLAYER_COLORS.orange },
      { vertexId: northTile.vertexIds[1]!, type: "settlement", color: SHOWCASE_PLAYER_COLORS.green },
      { vertexId: westTile.vertexIds[3]!, type: "city", color: SHOWCASE_PLAYER_COLORS.green }
    ]
  };
}

function uniqueRoads(roads: ShowcaseRoad[]): ShowcaseRoad[] {
  const seen = new Set<string>();
  return roads.filter((road) => {
    if (seen.has(road.edgeId)) {
      return false;
    }
    seen.add(road.edgeId);
    return true;
  });
}

function createRadiusTwoCoords(): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) {
        coords.push({ q, r });
      }
    }
  }

  return coords.sort((left, right) => {
    if (left.r !== right.r) {
      return left.r - right.r;
    }
    return left.q - right.q;
  });
}

function axialToWorld(q: number, r: number): [number, number] {
  const x = HEX_WIDTH * (q + r / 2);
  const y = HEX_HEIGHT * 0.75 * r;
  return [x, y];
}

function createTileMesh(
  tile: ShowcaseTile,
  verticesById: Map<string, ShowcaseVertex>,
  visualProfile: LandingVisualProfile
): THREE.Group {
  if (visualProfile === "fancy") {
    return createFancyTileMesh(tile, verticesById);
  }
  return createClassicTileMesh(tile, verticesById);
}

function createClassicTileMesh(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.Group {
  const tileTopColor = TILE_COLORS[tile.resource];
  const tileSideColor = getTileOuterSideColor(tile.resource);
  const tileInsetTopColor = shadeColor(TILE_COLORS[tile.resource], 0.04);
  const tileInsetSideColor = shadeColor(TILE_COLORS[tile.resource], -0.04);
  const sandUnderlay = createTileSandUnderlay(tile, verticesById);
  const outerShape = createTileShape(tile, verticesById, TILE_OUTER_RENDER_SCALE);
  const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: TILE_OUTER_BEVEL_SIZE,
    bevelThickness: TILE_OUTER_BEVEL_THICKNESS,
    curveSegments: 6
  });
  outerGeometry.rotateX(-Math.PI / 2);

  const insetShape = createTileShape(tile, verticesById, TILE_INSET_RENDER_SCALE);
  const insetGeometry = new THREE.ExtrudeGeometry(insetShape, {
    depth: TILE_INSET_DEPTH,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: TILE_INSET_BEVEL_SIZE,
    bevelThickness: TILE_INSET_BEVEL_THICKNESS,
    curveSegments: 6
  });
  insetGeometry.rotateX(-Math.PI / 2);

  const outerMesh = new THREE.Mesh(outerGeometry, [
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
  ]);

  const insetMesh = new THREE.Mesh(insetGeometry, [
    new THREE.MeshStandardMaterial({
      color: tileInsetTopColor,
      roughness: 0.86,
      metalness: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: tileInsetSideColor,
      roughness: 0.94,
      metalness: 0.01
    })
  ]);
  insetMesh.position.y = TILE_HEIGHT - TILE_INSET_DEPTH + 0.015;

  const tileGroup = new THREE.Group();
  tileGroup.add(sandUnderlay, outerMesh, insetMesh);
  return tileGroup;
}

function createFancyTileMesh(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.Group {
  const bundle = createUltraTerrainTextureBundle(tile.resource, "landing");
  const sandUnderlay = createTileSandUnderlay(tile, verticesById);
  const outerShape = createTileShape(tile, verticesById, TILE_OUTER_RENDER_SCALE);
  const outerGeometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: TILE_OUTER_BEVEL_SIZE,
    bevelThickness: TILE_OUTER_BEVEL_THICKNESS,
    curveSegments: 6
  });
  outerGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(outerGeometry);

  const insetShape = createTileShape(tile, verticesById, TILE_INSET_RENDER_SCALE);
  const insetGeometry = new THREE.ExtrudeGeometry(insetShape, {
    depth: TILE_INSET_DEPTH,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: TILE_INSET_BEVEL_SIZE,
    bevelThickness: TILE_INSET_BEVEL_THICKNESS,
    curveSegments: 6
  });
  insetGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(insetGeometry);

  const outerMesh = new THREE.Mesh(outerGeometry, [
    new THREE.MeshStandardMaterial({
      color: bundle.appearance.topTint,
      map: bundle.colorMap,
      ...(bundle.roughnessMap ? { roughnessMap: bundle.roughnessMap } : {}),
      ...(bundle.bumpMap ? { bumpMap: bundle.bumpMap } : {}),
      roughness: bundle.appearance.roughness,
      metalness: bundle.appearance.metalness,
      bumpScale: bundle.appearance.bumpScale * 0.82,
      emissive: new THREE.Color(bundle.appearance.emissive),
      emissiveIntensity: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: bundle.appearance.sideTint,
      roughness: 0.96,
      metalness: 0.02
    })
  ]);

  const insetMesh = new THREE.Mesh(insetGeometry, [
    new THREE.MeshStandardMaterial({
      color: bundle.appearance.insetTint,
      map: bundle.colorMap,
      ...(bundle.roughnessMap ? { roughnessMap: bundle.roughnessMap } : {}),
      ...(bundle.bumpMap ? { bumpMap: bundle.bumpMap } : {}),
      roughness: Math.max(bundle.appearance.roughness - 0.05, 0.36),
      metalness: bundle.appearance.metalness,
      bumpScale: bundle.appearance.bumpScale,
      emissive: new THREE.Color(bundle.appearance.emissive),
      emissiveIntensity: 0.028
    }),
    new THREE.MeshStandardMaterial({
      color: bundle.appearance.insetSideTint,
      roughness: 0.94,
      metalness: 0.01
    })
  ]);
  insetMesh.position.y = TILE_HEIGHT - TILE_INSET_DEPTH + 0.015;

  const overlayGeometry = new THREE.ShapeGeometry(createTileShape(tile, verticesById, TILE_OVERLAY_RENDER_SCALE));
  overlayGeometry.rotateX(-Math.PI / 2);
  remapPlanarTileUvs(overlayGeometry);
  const overlay = new THREE.Mesh(
    overlayGeometry,
    new THREE.MeshBasicMaterial({
      color: bundle.appearance.overlayBase,
      alphaMap: bundle.overlayMask,
      transparent: true,
      opacity: bundle.appearance.overlayOpacity,
      depthWrite: false
    })
  );
  overlay.position.y = TILE_HEIGHT + 0.03;

  const tileGroup = new THREE.Group();
  const propGroup = createFancyTileProps(tile.resource);
  propGroup.position.y = TILE_HEIGHT + 0.02;
  propGroup.scale.setScalar(TILE_OUTER_RENDER_SCALE * 0.86);
  tileGroup.add(sandUnderlay, outerMesh, insetMesh, overlay, propGroup);
  return tileGroup;
}

function createTileSandUnderlay(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.Mesh {
  const sand = new THREE.Mesh(getTileSandGeometry(tile, verticesById), tileSandMaterial);
  sand.position.y = TILE_SAND_UNDERLAY_Y;
  return sand;
}

function getTileSandGeometry(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.ShapeGeometry {
  const cacheKey = createTileShapeKey(tile);
  let geometry = tileSandGeometryCache.get(cacheKey);
  if (!geometry) {
    geometry = markSharedResource(new THREE.ShapeGeometry(createTileShape(tile, verticesById, TILE_SAND_UNDERLAY_SCALE)));
    geometry.rotateX(-Math.PI / 2);
    tileSandGeometryCache.set(cacheKey, geometry);
  }
  return geometry;
}

function createTileShapeKey(tile: ShowcaseTile): string {
  return tile.vertexIds.join(",");
}

function createTileOutline(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.LineLoop {
  const points = tile.vertexIds.map((vertexId) => {
    const vertex = verticesById.get(vertexId)!;
    return new THREE.Vector3(vertex.x - tile.x, 0, vertex.y - tile.y);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({
      color: "#f4e4b8",
      transparent: true,
      opacity: 0.14
    })
  );
}

function createTileShape(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>, scale = 1): THREE.Shape {
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

export function createFancyTileProps(resource: Resource | "desert"): THREE.Group {
  const cached = fancyTilePropTemplateCache.get(resource);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group = new THREE.Group();

  switch (resource) {
    case "grain":
      group.add(markLandingProp(createShowcaseBarn()));
      group.add(markLandingProp(positionObject(createShowcaseScarecrow(), 1.42, 0, -0.48, 0.16)));
      group.add(markLandingProp(positionObject(createShowcaseHayBales(), -1.08, 0, 0.9, -0.22)));
      break;
    case "wool":
      group.add(markLandingProp(createShowcaseSheepfold()));
      group.add(markLandingProp(positionObject(createShowcaseFlowers(), 1.2, 0, -0.9, 0.12)));
      break;
    case "desert":
      group.add(markLandingProp(createShowcaseCactusPatch()));
      group.add(markLandingProp(positionObject(createShowcaseBones(), 1.22, 0, -0.9, -0.18)));
      break;
    case "brick":
      group.add(markLandingProp(createShowcaseKiln()));
      group.add(markLandingProp(positionObject(createShowcaseBrickStacks(), 1.28, 0, 0.92, -0.14)));
      break;
    case "lumber":
      group.add(markLandingProp(createShowcaseLogCamp()));
      group.add(markLandingProp(positionObject(createShowcaseFernPatch(), 1.18, 0, -1.08, 0.18)));
      break;
    case "ore":
      group.add(markLandingProp(createShowcaseCrystalCamp()));
      group.add(markLandingProp(positionObject(createShowcaseRockScatter(), 1.1, 0, -0.92, 0.08)));
      break;
  }

  markObjectResourcesShared(group);
  fancyTilePropTemplateCache.set(resource, group);
  return cloneSharedTemplate(group);
}

function cloneSharedTemplate<T extends THREE.Object3D>(template: T): T {
  const clone = template.clone(true);
  clone.traverse((object) => {
    object.userData = { ...object.userData };
  });
  return clone;
}

function markObjectResourcesShared(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) {
      return;
    }

    markSharedResource(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      markSharedResource(material);
      markMaterialTexturesShared(material);
    }
  });
}

function markMaterialTexturesShared(material: THREE.Material): void {
  const materialRecord = material as unknown as Partial<Record<string, unknown>>;
  for (const value of Object.values(materialRecord)) {
    if (value instanceof THREE.Texture) {
      markSharedResource(value);
    }
  }
}

function markSharedResource<T extends { userData: Record<string, unknown> }>(resource: T): T {
  resource.userData[SHARED_RESOURCE_FLAG] = true;
  return resource;
}

function isSharedResource(resource: { userData?: Record<string, unknown> } | null | undefined): boolean {
  return resource?.userData?.[SHARED_RESOURCE_FLAG] === true;
}

function positionObject<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, rotationY = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = rotationY;
  return object;
}

function markLandingProp<T extends THREE.Object3D>(object: T): T {
  object.traverse((entry) => {
    entry.userData.landingProp = true;
  });
  return object;
}

function createShowcaseBarn(): THREE.Group {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: "#a1543c",
    roughness: 0.82,
    metalness: 0.02
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: "#5b2d23",
    roughness: 0.76,
    metalness: 0.03
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: "#f2d29d",
    roughness: 0.8,
    metalness: 0.01
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.86, 1.1), wallMaterial);
  body.position.y = 0.43;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.04, 0.82, 4), roofMaterial);
  roof.position.y = 1.22;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.12, 1, 0.9);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.08), trimMaterial);
  door.position.set(0, 0.28, 0.56);
  const loft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.08), trimMaterial);
  loft.position.set(0, 0.66, 0.56);
  group.add(body, roof, door, loft);
  group.position.set(-0.76, 0, -0.04);
  group.rotation.y = -0.22;
  return group;
}

function createShowcaseScarecrow(): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#8a663e",
    roughness: 0.9,
    metalness: 0.01
  });
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: "#c38d3c",
    roughness: 0.84,
    metalness: 0.01
  });
  const hatMaterial = new THREE.MeshStandardMaterial({
    color: "#5d4630",
    roughness: 0.92,
    metalness: 0.01
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.86, 6), woodMaterial);
  post.position.y = 0.43;
  const arms = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.08), woodMaterial);
  arms.position.y = 0.62;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 6), clothMaterial);
  body.position.y = 0.48;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), trimMaterialFromHex("#e0c89a"));
  head.position.y = 0.84;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.08, 10), hatMaterial);
  hat.position.y = 0.97;
  group.add(post, arms, body, head, hat);
  return group;
}

function createShowcaseHayBales(): THREE.Group {
  const group = new THREE.Group();
  const hayMaterial = new THREE.MeshStandardMaterial({
    color: "#d8b453",
    roughness: 0.88,
    metalness: 0.01
  });
  const baleOffsets = [
    { x: -0.18, z: 0.04, s: 1 },
    { x: 0.12, z: -0.08, s: 0.82 },
    { x: 0.22, z: 0.12, s: 0.7 }
  ] as const;

  for (const entry of baleOffsets) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * entry.s, 0.16 * entry.s, 0.28 * entry.s, 12), hayMaterial);
    bale.rotation.z = Math.PI / 2;
    bale.position.set(entry.x, 0.16 * entry.s, entry.z);
    group.add(bale);
  }

  return group;
}

function createShowcaseSheepfold(): THREE.Group {
  const group = new THREE.Group();
  group.add(positionObject(createShowcaseFence(), -0.18, 0, 0.44));
  group.add(positionObject(createShowcaseFence(), -0.72, 0, 0, Math.PI / 2));
  group.add(positionObject(createShowcaseFence(), 0.38, 0, -0.02, Math.PI / 2));
  group.add(positionObject(createShowcaseSheep(true), -0.12, 0.02, -0.06, 0.32));
  group.add(positionObject(createShowcaseSheep(false), 0.38, 0.02, -0.34, -0.28));
  group.add(positionObject(createShowcaseTrough(), 0.06, 0.01, 0.7, 0.08));
  group.position.set(-0.62, 0, -0.08);
  group.rotation.y = -0.16;
  return group;
}

function createShowcaseFence(): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#8a6a44",
    roughness: 0.92,
    metalness: 0.01
  });

  for (const x of [-0.3, 0.3] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.52, 5), woodMaterial);
    post.position.set(x, 0.26, 0);
    group.add(post);
  }

  const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.08), woodMaterial);
  railTop.position.y = 0.38;
  const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.08), woodMaterial);
  railBottom.position.y = 0.18;
  group.add(railTop, railBottom);
  return group;
}

function createShowcaseSheep(lead: boolean): THREE.Group {
  const group = new THREE.Group();
  const woolMaterial = new THREE.MeshStandardMaterial({
    color: lead ? "#f4f2e8" : "#dfe4d4",
    roughness: 0.82,
    metalness: 0.01
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: "#524338",
    roughness: 0.92,
    metalness: 0.01
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: "#f7f4ec",
    roughness: 0.74,
    metalness: 0.01
  });
  const muzzleMaterial = new THREE.MeshStandardMaterial({
    color: "#d8d1c3",
    roughness: 0.76,
    metalness: 0.01
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#111417",
    roughness: 0.5,
    metalness: 0.02
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.22, 4, 8), woolMaterial);
  body.position.set(-0.02, 0.28, 0);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1.12, 1, 0.94);
  const puffA = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMaterial);
  puffA.position.set(-0.18, 0.3, 0.09);
  const puffB = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMaterial);
  puffB.position.set(0.04, 0.34, -0.08);
  const puffC = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMaterial);
  puffC.position.set(0.12, 0.3, 0.07);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glowMaterial);
  tail.position.set(-0.3, 0.28, -0.02);
  tail.scale.set(0.9, 0.72, 0.9);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6), faceMaterial);
  neck.position.set(0.16, 0.29, 0.02);
  neck.rotation.z = -0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), faceMaterial);
  head.position.set(0.3, 0.33, 0.02);
  head.scale.set(0.92, 0.84, 1.2);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), muzzleMaterial);
  muzzle.position.set(0.39, 0.28, 0.02);
  muzzle.scale.set(1.06, 0.72, 0.84);
  const earLeft = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), faceMaterial);
  earLeft.position.set(0.3, 0.46, 0.1);
  earLeft.scale.set(0.74, 0.26, 1.24);
  earLeft.rotation.set(0.08, 0.14, -0.36);
  const earRight = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), faceMaterial);
  earRight.position.set(0.3, 0.44, -0.06);
  earRight.scale.set(0.74, 0.26, 1.14);
  earRight.rotation.set(-0.08, 0.1, -0.34);
  const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), eyeMaterial);
  eyeLeft.position.set(0.37, 0.34, 0.06);
  const eyeRight = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), eyeMaterial);
  eyeRight.position.set(0.37, 0.34, -0.01);
  const legs = [
    [-0.16, -0.08],
    [-0.04, 0.1],
    [0.1, -0.06],
    [0.2, 0.08]
  ] as const;
  for (const [x, z] of legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.2, 5), faceMaterial);
    leg.position.set(x, 0.1, z);
    group.add(leg);
  }
  group.add(body, puffA, puffB, puffC, tail, neck, head, muzzle, earLeft, earRight, eyeLeft, eyeRight);
  return group;
}

function createShowcaseTrough(): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#896845",
    roughness: 0.92,
    metalness: 0.01
  });
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: "#8fd1d9",
    roughness: 0.34,
    metalness: 0.03
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), woodMaterial);
  base.position.y = 0.06;
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.028, 0.14), waterMaterial);
  water.position.y = 0.13;
  group.add(base, water);
  return group;
}

function createShowcaseFlowers(): THREE.Group {
  const group = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: "#7ead58",
    roughness: 0.9,
    metalness: 0.01
  });
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#f3e3a1",
    roughness: 0.74,
    metalness: 0.01
  });
  const flowers = [
    { x: -0.12, z: 0.02, s: 1 },
    { x: 0.02, z: -0.08, s: 0.9 },
    { x: 0.16, z: 0.08, s: 0.76 }
  ] as const;

  for (const entry of flowers) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * entry.s, 0.018 * entry.s, 0.28 * entry.s, 4), stemMaterial);
    stem.position.set(entry.x, 0.14 * entry.s, entry.z);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06 * entry.s, 8, 6), petalMaterial);
    bloom.position.set(entry.x, 0.3 * entry.s, entry.z);
    bloom.scale.set(1.4, 0.72, 1.2);
    group.add(stem, bloom);
  }

  return group;
}

function createShowcaseCactusPatch(): THREE.Group {
  const group = new THREE.Group();
  const cactusMaterial = new THREE.MeshStandardMaterial({
    color: "#5d934b",
    roughness: 0.88,
    metalness: 0.01
  });
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: "#cfa96f",
    roughness: 0.94,
    metalness: 0
  });

  const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.74, 0.08, 8), sandMaterial);
  patch.position.y = 0.04;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.96, 8), cactusMaterial);
  trunk.position.set(-0.06, 0.48, 0);
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.42, 8), cactusMaterial);
  leftArm.position.set(-0.24, 0.46, 0);
  leftArm.rotation.z = 0.56;
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 8), cactusMaterial);
  rightArm.position.set(0.16, 0.38, 0.02);
  rightArm.rotation.z = -0.48;
  group.add(patch, trunk, leftArm, rightArm);
  group.position.set(-0.48, 0, -0.06);
  group.rotation.y = -0.12;
  return group;
}

function createShowcaseBones(): THREE.Group {
  const group = new THREE.Group();
  const boneMaterial = trimMaterialFromHex("#d7c7a6");
  const left = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 4, 8), boneMaterial);
  left.rotation.z = 0.82;
  left.position.set(-0.08, 0.05, 0);
  const right = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), boneMaterial);
  right.rotation.z = -0.64;
  right.position.set(0.12, 0.05, -0.02);
  group.add(left, right);
  return group;
}

function createShowcaseKiln(): THREE.Group {
  const group = new THREE.Group();
  const clayMaterial = new THREE.MeshStandardMaterial({
    color: "#995842",
    roughness: 0.94,
    metalness: 0.01
  });
  const darkClayMaterial = new THREE.MeshStandardMaterial({
    color: "#6d3a2d",
    roughness: 0.95,
    metalness: 0.01
  });
  const emberMaterial = new THREE.MeshStandardMaterial({
    color: "#ffb16b",
    roughness: 0.54,
    metalness: 0.01,
    emissive: new THREE.Color("#ffcf8a"),
    emissiveIntensity: 0.14
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.26, 10), clayMaterial);
  base.position.y = 0.13;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), darkClayMaterial);
  dome.position.y = 0.4;
  dome.scale.set(1.08, 0.8, 1);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), darkClayMaterial);
  chimney.position.set(0.28, 0.68, -0.06);
  const opening = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), emberMaterial);
  opening.position.set(0, 0.28, 0.36);
  group.add(base, dome, chimney, opening);
  group.position.set(-0.56, 0, -0.08);
  group.rotation.y = 0.14;
  return group;
}

function createShowcaseBrickStacks(): THREE.Group {
  const group = new THREE.Group();
  const brickMaterial = new THREE.MeshStandardMaterial({
    color: "#a66048",
    roughness: 0.92,
    metalness: 0.01
  });
  const stacks = [
    { x: -0.16, z: 0.02, layers: 2 },
    { x: 0.18, z: -0.06, layers: 3 },
    { x: 0.1, z: 0.24, layers: 1 }
  ] as const;

  for (const entry of stacks) {
    for (let layer = 0; layer < entry.layers; layer += 1) {
      const brick = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.056, 0.11), brickMaterial);
      brick.position.set(entry.x + (layer % 2 === 0 ? -0.04 : 0.04), 0.03 + layer * 0.06, entry.z + layer * 0.02);
      brick.rotation.y = layer % 2 === 0 ? 0.18 : -0.12;
      group.add(brick);
    }
  }

  return group;
}

function createShowcaseLogCamp(): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: "#7d5a38",
    roughness: 0.9,
    metalness: 0.01
  });
  const mossMaterial = new THREE.MeshStandardMaterial({
    color: "#4d7f3b",
    roughness: 0.92,
    metalness: 0.01
  });
  const logs = [
    { x: -0.18, z: 0.02, y: 0.08, l: 0.82, r: 0.08, angle: 0.12 },
    { x: 0.08, z: -0.1, y: 0.07, l: 0.72, r: 0.07, angle: -0.18 },
    { x: -0.02, z: 0.14, y: 0.18, l: 0.68, r: 0.068, angle: 0.28 },
    { x: 0.2, z: 0.12, y: 0.18, l: 0.58, r: 0.06, angle: -0.1 }
  ] as const;

  for (const entry of logs) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(entry.r, entry.r, entry.l, 8), woodMaterial);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = entry.angle;
    log.position.set(entry.x, entry.y, entry.z);
    group.add(log);
  }

  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 10), woodMaterial);
  stump.position.set(0.38, 0.11, -0.18);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mossMaterial);
  moss.position.set(-0.36, 0.12, 0.22);
  moss.scale.set(1.3, 0.74, 1.1);
  group.add(stump, moss);
  group.position.set(-0.56, 0, -0.02);
  group.rotation.y = 0.18;
  return group;
}

function createShowcaseFernPatch(): THREE.Group {
  const group = new THREE.Group();
  const fernMaterial = new THREE.MeshStandardMaterial({
    color: "#5f9447",
    roughness: 0.9,
    metalness: 0.01
  });
  for (const rotation of [-0.4, 0, 0.4] as const) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 4), fernMaterial);
    leaf.position.y = 0.18;
    leaf.rotation.z = Math.PI / 2 + rotation;
    leaf.rotation.x = -0.26;
    group.add(leaf);
  }
  return group;
}

function createShowcaseCrystalCamp(): THREE.Group {
  const group = new THREE.Group();
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: "#afc3dd",
    roughness: 0.34,
    metalness: 0.18,
    emissive: new THREE.Color("#e8f0ff"),
    emissiveIntensity: 0.08
  });
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#677182",
    roughness: 0.94,
    metalness: 0.02
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.08, 8), baseMaterial);
  base.position.y = 0.04;
  group.add(base);
  for (const entry of [
    { x: -0.18, z: 0.08, h: 0.72 },
    { x: 0.12, z: -0.1, h: 0.94 },
    { x: 0.28, z: 0.18, h: 0.58 }
  ] as const) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), crystalMaterial);
    crystal.position.set(entry.x, entry.h * 0.34, entry.z);
    crystal.scale.set(0.7, entry.h, 0.7);
    crystal.rotation.y = entry.x * 4.4;
    group.add(crystal);
  }
  for (const entry of [
    { x: -0.22, z: -0.16, s: 0.12 },
    { x: 0.14, z: 0.24, s: 0.09 }
  ] as const) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s, 0), baseMaterial);
    rock.position.set(entry.x, entry.s * 0.5, entry.z);
    rock.rotation.set(0.14, entry.x * 2.8, -0.08);
    group.add(rock);
  }
  const oreShard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), crystalMaterial);
  oreShard.position.set(0.04, 0.14, -0.22);
  oreShard.scale.set(0.72, 1.28, 0.74);
  group.add(oreShard);
  group.position.set(-0.46, 0, 0);
  group.rotation.y = -0.2;
  return group;
}

function createShowcaseRockScatter(): THREE.Group {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: "#7b8594",
    roughness: 0.95,
    metalness: 0.02
  });
  const oreMaterial = new THREE.MeshStandardMaterial({
    color: "#bed8f5",
    roughness: 0.42,
    metalness: 0.08,
    emissive: new THREE.Color("#dbe9ff"),
    emissiveIntensity: 0.06
  });
  for (const entry of [
    { x: -0.12, z: 0.04, s: 0.12 },
    { x: 0.1, z: -0.08, s: 0.16 },
    { x: 0.18, z: 0.14, s: 0.09 }
  ] as const) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(entry.s, 0), rockMaterial);
    rock.position.set(entry.x, entry.s * 0.5, entry.z);
    rock.rotation.set(0.12, entry.x * 3.2, -0.08);
    group.add(rock);
  }
  const oreNugget = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), oreMaterial);
  oreNugget.position.set(-0.02, 0.08, 0.16);
  oreNugget.scale.set(0.78, 1.18, 0.72);
  group.add(oreNugget);
  return group;
}

function createLandingWaterBackdrop(): THREE.Group {
  const backdrop = new THREE.Group();

  const deepWater = new THREE.Mesh(
    new THREE.CylinderGeometry(40.8, 42.6, 0.96, 72),
    new THREE.MeshStandardMaterial({
      color: "#0d6188",
      roughness: 0.38,
      metalness: 0.06,
      emissive: new THREE.Color("#0a4e70"),
      emissiveIntensity: 0.16
    })
  );
  deepWater.position.y = -0.9;

  const shallowWater = new THREE.Mesh(
    new THREE.CylinderGeometry(31.2, 32.3, 0.12, 72),
    new THREE.MeshStandardMaterial({
      color: "#6ebed8",
      roughness: 0.26,
      metalness: 0.03,
      transparent: true,
      opacity: 0.72,
      emissive: new THREE.Color("#8edaf0"),
      emissiveIntensity: 0.18
    })
  );
  shallowWater.position.y = -0.08;

  const foamRing = new THREE.Mesh(
    new THREE.TorusGeometry(29.8, 1.75, 10, 104),
    new THREE.MeshBasicMaterial({
      color: "#e6fbff",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false
    })
  );
  foamRing.position.y = 0.01;
  foamRing.rotation.x = Math.PI / 2;

  backdrop.add(deepWater, shallowWater, foamRing);
  return backdrop;
}

function trimMaterialFromHex(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.01
  });
}

function createRoadPiece(length: number, color: string): THREE.Group {
  return createRoadPieceModel(length, color, false, "detailed");
}

function createBuildingMesh(type: "settlement" | "city", color: string): THREE.Object3D {
  return createBuildingPieceModel(type, color, "detailed");
}

function createStarField(): THREE.Points {
  const starsGeometry = new THREE.BufferGeometry();
  const starCount = 140;
  const starPositions = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index += 1) {
    starPositions[index * 3] = (Math.random() - 0.5) * 60;
    starPositions[index * 3 + 1] = Math.random() * 18 + 4;
    starPositions[index * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  return new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({
      color: "#f9f0d9",
      size: 0.12,
      transparent: true,
      opacity: 0.66
    })
  );
}

function shadeColor(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}

function getTileOuterSideColor(resource: Resource | "desert"): string {
  return shadeColor(TILE_COLORS[resource], -0.06);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (!isSharedResource(object.geometry)) {
        object.geometry.dispose();
      }
      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterialWithTextures);
      } else {
        disposeMaterialWithTextures(object.material);
      }
      return;
    }

    if (object instanceof THREE.Points) {
      if (!isSharedResource(object.geometry)) {
        object.geometry.dispose();
      }
      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterialWithTextures);
      } else {
        disposeMaterialWithTextures(object.material);
      }
      return;
    }

    if (object instanceof THREE.Line) {
      if (!isSharedResource(object.geometry)) {
        object.geometry.dispose();
      }
      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterialWithTextures);
      } else {
        disposeMaterialWithTextures(object.material);
      }
    }
  });
}

function disposeMaterialWithTextures(material: THREE.Material): void {
  if (isSharedResource(material)) {
    return;
  }

  const materialRecord = material as unknown as Partial<Record<string, unknown>>;
  for (const value of Object.values(materialRecord)) {
    if (value instanceof THREE.Texture && !isSharedResource(value)) {
      value.dispose();
    }
  }
  material.dispose();
}
