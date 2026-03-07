import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Resource } from "@hexagonia/shared";

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

const TILE_COLORS: Record<Resource | "desert", string> = {
  brick: "#b86146",
  lumber: "#2f6f37",
  ore: "#79869a",
  grain: "#c7a13a",
  wool: "#a8cc79",
  desert: "#ccb07b"
};
const SHOWCASE_PLAYER_COLORS = {
  red: "#d75a4a",
  blue: "#4f78d7",
  orange: "#eb8e47",
  green: "#53b978"
} as const;

const TILE_HEIGHT = 1.18;
const BUILT_ROAD_RADIUS = 0.24;
const HEX_RADIUS = 1;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_HEIGHT = 2 * HEX_RADIUS;
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

export function LandingBoardScene(props: { reducedMotion: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hasFallback, setHasFallback] = useState(false);
  const showcaseBoard = useMemo(() => createShowcaseBoard(), []);

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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
    const clock = new THREE.Clock();
    const boardGroup = new THREE.Group();
    const pointer = new THREE.Vector2();
    const glowMarkers: Array<{ material: THREE.MeshBasicMaterial; speed: number; baseOpacity: number }> = [];
    let scrollProgress = 0;
    let frameId = 0;

    scene.add(boardGroup);
    camera.position.set(0, 23.5, 39.5);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(28, 31, 1.6, 64),
      new THREE.MeshStandardMaterial({
        color: "#0f2230",
        roughness: 0.95,
        metalness: 0.08
      })
    );
    table.position.y = -1.05;
    table.receiveShadow = true;
    boardGroup.add(table);

    const tableInset = new THREE.Mesh(
      new THREE.CylinderGeometry(25.2, 26.4, 0.24, 64),
      new THREE.MeshBasicMaterial({
        color: "#12374b",
        transparent: true,
        opacity: 0.22
      })
    );
    tableInset.position.y = -0.12;
    boardGroup.add(tableInset);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(28.5, 0.24, 12, 88),
      new THREE.MeshBasicMaterial({
        color: "#ecdfbb",
        transparent: true,
        opacity: 0.42
      })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = -0.16;
    boardGroup.add(outerRing);

    const haloRingMaterial = new THREE.MeshBasicMaterial({
      color: "#1f88b3",
      transparent: true,
      opacity: 0.15
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
      const tileGroup = createTileMesh(tile, verticesById);
      tileGroup.position.set(tile.x, 0, tile.y);
      tileGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
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
      roadObject.position.set((left.x + right.x) / 2, TILE_HEIGHT + BUILT_ROAD_RADIUS + 0.04, (left.y + right.y) / 2);
      roadObject.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz).normalize());
      road.castShadow = true;
      road.receiveShadow = true;
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

    const updateSize = () => {
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

    const handlePointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.set((x - 0.5) * 2, (y - 0.5) * 2);
    };

    const handlePointerLeave = () => {
      pointer.set(0, 0);
    };

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const motionScale = props.reducedMotion ? 0.2 : 1;
      const boardTilt = props.reducedMotion ? 0.32 : 0.32 + Math.sin(elapsed * 0.32) * 0.015;
      const boardDrift = elapsed * 0.11 * motionScale;
      boardGroup.rotation.y = boardTilt + boardDrift + scrollProgress * 0.12;
      boardGroup.position.y = props.reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.08;

      glowMarkers.forEach((entry, index) => {
        entry.material.opacity =
          entry.baseOpacity + (props.reducedMotion ? 0 : (Math.sin(elapsed * entry.speed + index * 0.7) + 1) * 0.05);
      });

      outerRing.rotation.z = elapsed * 0.045 * motionScale;
      stars.rotation.y = elapsed * 0.025 * motionScale;

      const targetPosition = new THREE.Vector3(
        pointer.x * (props.reducedMotion ? 0.25 : 1.65),
        23.5 + scrollProgress * 2.2 + pointer.y * (props.reducedMotion ? 0.08 : -0.55),
        39.5 - scrollProgress * 4.6
      );
      camera.position.lerp(targetPosition, props.reducedMotion ? 0.08 : 0.05);
      camera.lookAt(pointer.x * 1.1, 1.9 + scrollProgress * 0.7, pointer.y * 0.45);

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    updateSize();
    updateScrollProgress();
    animate();

    window.addEventListener("resize", updateSize);
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    mount.addEventListener("pointermove", handlePointerMove);
    mount.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("scroll", updateScrollProgress);
      mount.removeEventListener("pointermove", handlePointerMove);
      mount.removeEventListener("pointerleave", handlePointerLeave);
      disposeObjectTree(scene);
      renderer.dispose();
      mount.replaceChildren();
    };
  }, [hasFallback, props.reducedMotion, showcaseBoard]);

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

function createTileMesh(tile: ShowcaseTile, verticesById: Map<string, ShowcaseVertex>): THREE.Group {
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
  insetMesh.position.y = TILE_HEIGHT - insetDepth + 0.015;

  const tileGroup = new THREE.Group();
  tileGroup.add(outerMesh, insetMesh);
  return tileGroup;
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

function createRoadPiece(length: number, color: string): THREE.Mesh {
  const roadLength = Math.max(length * 0.84 - BUILT_ROAD_RADIUS * 2, 0.1);
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(BUILT_ROAD_RADIUS, roadLength, 4, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.03,
      emissive: new THREE.Color(color).multiplyScalar(0.24),
      emissiveIntensity: 0.16
    })
  );
}

function createBuildingMesh(type: "settlement" | "city", color: string): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color,
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
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.86, 0.7, 4),
    new THREE.MeshStandardMaterial({
      color: shadeColor(color, 0.08),
      roughness: 0.58,
      metalness: 0.04
    })
  );
  roof.position.y = 1.15;
  roof.rotation.y = Math.PI / 4;
  group.add(body, roof);
  return group;
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
  return shadeColor(TILE_COLORS[resource], resource === "lumber" ? -0.045 : -0.085);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
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
      return;
    }

    if (object instanceof THREE.Points) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
      return;
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
