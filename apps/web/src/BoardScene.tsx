import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MatchSnapshot, Resource } from "@hexagonia/shared";

export type InteractionMode = "road" | "settlement" | "city" | "robber" | "road_building" | null;

interface BoardSceneProps {
  snapshot: MatchSnapshot;
  interactionMode: InteractionMode;
  selectedRoadEdges: string[];
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

export function BoardScene(props: BoardSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boardGroupRef = useRef<THREE.Group | null>(null);
  const interactiveRef = useRef<THREE.Object3D[]>([]);
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
    camera.position.set(0, 52, 46);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.target.set(0, 0, 0);
    controls.minDistance = 28;
    controls.maxDistance = 88;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.update();

    scene.add(new THREE.AmbientLight("#d5e4f2", 1.35));
    const keyLight = new THREE.DirectionalLight("#f6efe0", 1.45);
    keyLight.position.set(24, 36, 16);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#89b9ff", 0.55);
    fillLight.position.set(-20, 18, -20);
    scene.add(fillLight);

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

    const onPointerDown = (event: PointerEvent) => {
      const rendererNode = rendererRef.current?.domElement;
      const cameraNode = cameraRef.current;
      if (!rendererNode || !cameraNode) {
        return;
      }

      const rect = rendererNode.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraNode);
      const intersections = raycaster.intersectObjects(interactiveRef.current, false);
      const hit = intersections[0]?.object.userData as { kind?: "tile" | "edge" | "vertex"; id?: string } | undefined;
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

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", handleResize);
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
      scene.remove(boardGroupRef.current);
    }

    const group = new THREE.Group();
    interactiveRef.current = [];
    boardGroupRef.current = group;
    scene.add(group);

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
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(4.45, 4.45, 1.6, 6),
        new THREE.MeshStandardMaterial({
          color: TILE_COLORS[tile.resource],
          roughness: 0.92,
          metalness: 0.04
        })
      );
      base.rotation.y = Math.PI / 6;
      base.position.set(tile.x, 0, tile.y);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const tokenSprite = createTokenSprite(tile.token, tile.robber);
      tokenSprite.position.set(tile.x, 1.2, tile.y);
      group.add(tokenSprite);

      if (robberTileIds.has(tile.id)) {
        const hotspot = new THREE.Mesh(
          new THREE.CylinderGeometry(4.9, 4.9, 0.3, 6),
          new THREE.MeshStandardMaterial({
            color: "#ffcc66",
            transparent: true,
            opacity: 0.4
          })
        );
        hotspot.rotation.y = Math.PI / 6;
        hotspot.position.set(tile.x, 1.95, tile.y);
        hotspot.userData = { kind: "tile", id: tile.id };
        group.add(hotspot);
        interactiveRef.current.push(hotspot);
      }
    }

    for (const edge of props.snapshot.board.edges) {
      const [leftId, rightId] = edge.vertexIds;
      const left = props.snapshot.board.vertices.find((vertex) => vertex.id === leftId)!;
      const right = props.snapshot.board.vertices.find((vertex) => vertex.id === rightId)!;
      const dx = right.x - left.x;
      const dz = right.y - left.y;
      const length = Math.sqrt(dx * dx + dz * dz);
      const centerX = (left.x + right.x) / 2;
      const centerZ = (left.y + right.y) / 2;

      const active = legalEdges.has(edge.id);
      const selected = props.selectedRoadEdges.includes(edge.id);
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(length * 0.94, 0.45, 0.8),
        new THREE.MeshStandardMaterial({
          color: edge.color ? colorToHex(edge.color) : active ? "#f5d06f" : "#1a2e40",
          roughness: 0.7,
          metalness: 0.12,
          emissive: selected ? new THREE.Color("#ffbf4d") : new THREE.Color("#000000"),
          emissiveIntensity: selected ? 0.7 : 0
        })
      );
      road.position.set(centerX, edge.ownerId ? 0.95 : 0.6, centerZ);
      road.rotation.y = Math.atan2(dx, dz);
      road.castShadow = true;
      group.add(road);

      if (active) {
        road.userData = { kind: "edge", id: edge.id };
        interactiveRef.current.push(road);
      }
    }

    for (const vertex of props.snapshot.board.vertices) {
      const active = legalVertices.has(vertex.id);
      const building = vertex.building;
      const mesh = building
        ? createBuildingMesh(building.type, building.color)
        : new THREE.Mesh(
            new THREE.SphereGeometry(active ? 0.88 : 0.58, 18, 18),
            new THREE.MeshStandardMaterial({
              color: active ? "#f3cf83" : vertex.portType ? "#3f5f78" : "#1e3245",
              roughness: 0.62,
              metalness: 0.1,
              emissive: active ? new THREE.Color("#f0a93a") : new THREE.Color("#000000"),
              emissiveIntensity: active ? 0.25 : 0
            })
          );

      mesh.position.set(vertex.x, building ? 1.65 : 1.25, vertex.y);
      mesh.castShadow = true;
      group.add(mesh);

      if (active) {
        mesh.userData = { kind: "vertex", id: vertex.id };
        interactiveRef.current.push(mesh);
      }
    }
  }, [props.interactionMode, props.selectedRoadEdges, props.snapshot]);

  return <div className="board-canvas" ref={mountRef} />;
}

function createBuildingMesh(type: "settlement" | "city", color: string): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color: colorToHex(color),
    roughness: 0.58,
    metalness: 0.12
  });

  if (type === "city") {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.2, 1.45), material);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.7, 0.75), material);
    tower.position.y = 1.35;
    group.add(base, tower);
    return group;
  }

  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.2, 5), material);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.95, 5), material);
  roof.position.y = 0.95;
  group.add(body, roof);
  return group;
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

function colorToHex(color: string): string {
  const mapping: Record<string, string> = {
    red: "#d75a4a",
    blue: "#4f78d7",
    white: "#e8e8ea",
    orange: "#eb8e47"
  };
  return mapping[color] ?? color;
}
