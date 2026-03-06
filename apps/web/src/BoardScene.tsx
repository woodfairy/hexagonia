import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MatchSnapshot, Resource } from "@hexagonia/shared";

export type InteractionMode = "road" | "settlement" | "city" | "robber" | "road_building" | null;
export interface BoardFocusCue {
  key: string;
  mode: "event" | "action";
  title: string;
  detail: string;
  badges?: string[];
  vertexIds: string[];
  edgeIds: string[];
  tileIds: string[];
  scale: "tight" | "medium" | "wide";
}

interface BoardSceneProps {
  snapshot: MatchSnapshot;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
  focusCue: BoardFocusCue | null;
  cameraCue: BoardFocusCue | null;
  onVertexSelect: (vertexId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onTileSelect: (tileId: string) => void;
}

const TILE_COLORS: Record<Resource | "desert", string> = {
  brick: "#b6543d",
  lumber: "#3f7f4b",
  ore: "#6a7286",
  grain: "#d4a73b",
  wool: "#88b45c",
  desert: "#c6ad72"
};

const TILE_HEIGHT = 1.18;
const BUILT_ROAD_RADIUS = 0.24;
const GUIDE_ROAD_RADIUS = 0.14;
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 52, 46);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

interface MaterialState {
  material: THREE.Material | THREE.SpriteMaterial;
  opacity?: number;
  emissiveIntensity?: number;
  color?: THREE.Color;
}

interface InteractiveMeta {
  kind: "tile" | "edge" | "vertex";
  id: string;
  baseScale: THREE.Vector3;
  hoverScale: number;
  materialStates: MaterialState[];
  marker?: THREE.Object3D;
}

export function BoardScene(props: BoardSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const interactiveRef = useRef<THREE.Object3D[]>([]);
  const pulseObjectsRef = useRef<THREE.Object3D[]>([]);
  const focusTargetRef = useRef(DEFAULT_CAMERA_TARGET.clone());
  const focusCameraPositionRef = useRef(DEFAULT_CAMERA_POSITION.clone());
  const lastFocusKeyRef = useRef<string | null>(null);
  const autoFlightRef = useRef(false);
  const userInteractingRef = useRef(false);
  const hoveredInteractiveRef = useRef<THREE.Object3D | null>(null);
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    controls.minDistance = 28;
    controls.maxDistance = 88;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.update();
    focusTargetRef.current.copy(DEFAULT_CAMERA_TARGET);
    focusCameraPositionRef.current.copy(DEFAULT_CAMERA_POSITION);
    renderer.domElement.style.cursor = "grab";

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
      renderer.domElement.style.cursor = hoveredInteractiveRef.current ? "pointer" : "grab";
    };
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("end", onControlEnd);

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

    const updateHoveredObject = (nextObject: THREE.Object3D | null) => {
      if (hoveredInteractiveRef.current === nextObject) {
        return;
      }

      setInteractiveHoverState(hoveredInteractiveRef.current, false);
      hoveredInteractiveRef.current = nextObject;
      setInteractiveHoverState(nextObject, true);
      if (!userInteractingRef.current) {
        renderer.domElement.style.cursor = nextObject ? "pointer" : "grab";
      }
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

    const onPointerMove = (event: PointerEvent) => {
      updateHoveredObject(getInteractiveObjectAtPointer(event));
    };

    const onPointerLeave = () => {
      updateHoveredObject(null);
      if (!userInteractingRef.current) {
        renderer.domElement.style.cursor = "grab";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = getInteractiveObjectAtPointer(event);
      const hit = target?.userData as { kind?: "tile" | "edge" | "vertex"; id?: string } | undefined;
      if (!hit?.kind || !hit.id) {
        return;
      }

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

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.setAnimationLoop(() => {
      const pulse = performance.now() * 0.005;
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
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      if (boardGroupRef.current) {
        disposeObjectTree(boardGroupRef.current);
        scene.remove(boardGroupRef.current);
        boardGroupRef.current = null;
      }
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", handleResize);
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

    if (boardGroupRef.current) {
      setInteractiveHoverState(hoveredInteractiveRef.current, false);
      hoveredInteractiveRef.current = null;
      disposeObjectTree(boardGroupRef.current);
      scene.remove(boardGroupRef.current);
    }

    const group = new THREE.Group();
    interactiveRef.current = [];
    pulseObjectsRef.current = [];
    boardGroupRef.current = group;
    scene.add(group);
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

    const robberTileIds = new Set(
      props.interactionMode === "robber"
        ? props.snapshot.allowedMoves.robberMoveOptions.map((option) => option.tileId)
        : []
    );

    for (const tile of props.snapshot.board.tiles) {
      const active = robberTileIds.has(tile.id);
      const base = createTileMesh(tile, verticesById, active);
      base.position.set(tile.x, 0, tile.y);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const outline = createTileOutline(tile, verticesById);
      outline.position.set(tile.x, TILE_HEIGHT + 0.04, tile.y);
      group.add(outline);

      const tokenSprite = createTokenSprite(tile.token, tile.robber);
      tokenSprite.position.set(tile.x, TILE_HEIGHT + 0.62, tile.y);
      group.add(tokenSprite);

      if (active) {
        const marker = createTileFocusMarker(tile, verticesById, false);
        marker.position.set(tile.x, TILE_HEIGHT + 0.52, tile.y);
        registerPulseVisual(marker, pulseObjectsRef.current, "soft", 1.08);
        group.add(marker);
        attachInteractiveMeta(base, "tile", tile.id, 1.02, marker);
        interactiveRef.current.push(base);
      }
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
      road.position.set(centerX, edge.ownerId ? TILE_HEIGHT + BUILT_ROAD_RADIUS + 0.04 : TILE_HEIGHT + GUIDE_ROAD_RADIUS, centerZ);
      road.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, 0, dz).normalize()
      );
      road.castShadow = !!edge.ownerId;
      group.add(road);

      if (active) {
        registerPulseVisual(road, pulseObjectsRef.current, selected ? "strong" : "soft", 1.08);
        attachInteractiveMeta(road, "edge", edge.id, selected ? 1.1 : 1.08);
        interactiveRef.current.push(road);
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

        attachInteractiveMeta(mesh, "vertex", vertex.id, building ? 1.05 : 1.12, marker);
        interactiveRef.current.push(mesh);
      }
    }

    if (props.focusCue) {
      appendFocusMarkers(group, props.snapshot, verticesById, props.focusCue, pulseObjectsRef.current);
    }
  }, [props.focusCue, props.interactionMode, props.selectedRoadEdges, props.snapshot]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    if (!props.cameraCue) {
      return;
    }

    if (lastFocusKeyRef.current === props.cameraCue.key) {
      return;
    }

    lastFocusKeyRef.current = props.cameraCue.key;

    const nextFocus = resolveFocusCuePosition(props.snapshot, props.cameraCue);
    const currentDirection = camera.position.clone().sub(controls.target);
    const direction = currentDirection.lengthSq() > 0.01 ? currentDirection.normalize() : DEFAULT_CAMERA_POSITION.clone().normalize();
    const distance =
      props.cameraCue.scale === "tight" ? 26 : props.cameraCue.scale === "medium" ? 34 : 44;
    const target = new THREE.Vector3(nextFocus.x, TILE_HEIGHT * 0.45, nextFocus.z);
    const nextCameraPosition = target.clone().add(direction.multiplyScalar(distance));
    nextCameraPosition.y = Math.max(nextCameraPosition.y, props.cameraCue.scale === "tight" ? 18 : 24);

    focusTargetRef.current.copy(target);
    focusCameraPositionRef.current.copy(nextCameraPosition);
    autoFlightRef.current = true;
  }, [props.cameraCue, props.snapshot]);

  return <div className="board-canvas" ref={mountRef} />;
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

function createTokenSprite(token: number | null, robber: boolean): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext("2d")!;

  context.fillStyle = robber ? "#17212b" : "#f4edd8";
  context.beginPath();
  context.arc(80, 80, 50, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 6;
  context.strokeStyle = robber ? "#f3cf83" : "#6b4a1b";
  context.stroke();

  if (token !== null) {
    context.fillStyle = token === 6 || token === 8 ? "#b83e2f" : "#203240";
    context.font = "700 54px 'Segoe UI Variable', 'Trebuchet MS', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(token), 80, 76);
  } else {
    context.fillStyle = "#f3cf83";
    context.font = "700 22px 'Segoe UI Variable', 'Trebuchet MS', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("RAUBER", 80, 80);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    })
  );
  sprite.scale.set(4.8, 4.8, 1);
  return sprite;
}

function createTileMesh(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>,
  active: boolean
): THREE.Mesh {
  const shape = createTileShape(tile, verticesById);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.24,
    bevelThickness: 0.12,
    curveSegments: 6
  });
  geometry.rotateX(-Math.PI / 2);

  const topMaterial = new THREE.MeshStandardMaterial({
    color: TILE_COLORS[tile.resource],
    roughness: 0.9,
    metalness: 0.02,
    emissive: active ? new THREE.Color("#f2c56b") : new THREE.Color("#000000"),
    emissiveIntensity: active ? 0.18 : 0
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: shadeColor(TILE_COLORS[tile.resource], -0.18),
    roughness: 0.96,
    metalness: 0.01
  });

  return new THREE.Mesh(geometry, [topMaterial, sideMaterial]);
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
      color: "#f4edd8",
      transparent: true,
      opacity: 0.22
    })
  );
}

function createTileShape(
  tile: MatchSnapshot["board"]["tiles"][number],
  verticesById: Map<string, MatchSnapshot["board"]["vertices"][number]>
): THREE.Shape {
  const shape = new THREE.Shape();
  tile.vertexIds.forEach((vertexId, index) => {
    const vertex = verticesById.get(vertexId)!;
    const x = vertex.x - tile.x;
    const y = vertex.y - tile.y;
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
  const roadLength = Math.max(length * 0.74 - BUILT_ROAD_RADIUS * 2, 0.1);
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
  const guideLength = Math.max(length * 0.68 - GUIDE_ROAD_RADIUS * 2, 0.1);
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(GUIDE_ROAD_RADIUS, guideLength, 4, 10),
    new THREE.MeshStandardMaterial({
      color: selected ? "#ffd68a" : "#f5d06f",
      roughness: 0.48,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.95 : 0.62,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.38 : 0.18
    })
  );
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
): { x: number; z: number } {
  const verticesById = new Map(snapshot.board.vertices.map((vertex) => [vertex.id, vertex]));
  const positions: Array<{ x: number; z: number }> = [];

  for (const tileId of cue.tileIds) {
    const tile = snapshot.board.tiles.find((entry) => entry.id === tileId);
    if (tile) {
      positions.push({ x: tile.x, z: tile.y });
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
    return { x: 0, z: 0 };
  }

  const aggregate = positions.reduce(
    (current, position) => ({
      x: current.x + position.x,
      z: current.z + position.z
    }),
    { x: 0, z: 0 }
  );

  return {
    x: aggregate.x / positions.length,
    z: aggregate.z / positions.length
  };
}

function shadeColor(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }

    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }

    if (object instanceof THREE.Line) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  });
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
      state.material.opacity = hovered ? Math.min(state.opacity + 0.18, 1) : state.opacity;
    }
    if (typeof state.emissiveIntensity === "number" && "emissiveIntensity" in state.material) {
      state.material.emissiveIntensity = hovered ? state.emissiveIntensity + 0.18 : state.emissiveIntensity;
    }
  }

  if (meta.marker) {
    meta.marker.userData.hovered = hovered;
  }
}

function collectMaterialStates(root: THREE.Object3D): MaterialState[] {
  const states: MaterialState[] = [];

  root.traverse((object) => {
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
