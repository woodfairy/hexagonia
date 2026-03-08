import * as THREE from "three";

const SHARED_RESOURCE_FLAG = "__sharedResource";
const roadTemplateCache = new Map<string, THREE.Group>();
const buildingTemplateCache = new Map<string, THREE.Group>();
const sharedGeometryCache = new Map<string, THREE.BufferGeometry>();
const sharedMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

const BUILT_ROAD_CLEARANCE = 0.24;
const GUIDE_ROAD_CLEARANCE = 0.14;

export const BUILT_ROAD_ELEVATION = 0.12;
export const GUIDE_ROAD_ELEVATION = 0.06;

export function createRoadPieceModel(length: number, color: string, selected: boolean): THREE.Group {
  const roadLength = Math.max(length * 0.84 - BUILT_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `road:${roadLength.toFixed(4)}:${color}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group = new THREE.Group();
  const base = new THREE.Mesh(
    getRoadDeckGeometry(`road-deck:${roadLength.toFixed(4)}`, roadLength, 0.56, 0.36, 0.16),
    getSharedMaterial(`road-base:${color}`, {
      color: shadeColor(color, -0.14),
      roughness: 0.84,
      metalness: 0.02
    })
  );
  const surface = new THREE.Mesh(
    getBoxGeometry(`road-surface:${roadLength.toFixed(4)}`, roadLength * 0.92, 0.046, 0.28),
    getSharedMaterial(`road-surface:${color}:${selected ? 1 : 0}`, {
      color,
      roughness: 0.68,
      metalness: 0.04,
      emissive: new THREE.Color(selected ? "#ffcb74" : shadeColor(color, -0.24)),
      emissiveIntensity: selected ? 0.34 : 0.06
    })
  );
  surface.position.y = 0.093;

  const crest = new THREE.Mesh(
    getBoxGeometry(`road-crest:${roadLength.toFixed(4)}`, roadLength * 0.74, 0.032, 0.1),
    getSharedMaterial(`road-crest:${color}:${selected ? 1 : 0}`, {
      color: shadeColor(color, 0.12),
      roughness: 0.6,
      metalness: 0.05,
      emissive: new THREE.Color(selected ? "#ffd78d" : "#000000"),
      emissiveIntensity: selected ? 0.2 : 0
    })
  );
  crest.position.y = 0.132;

  group.add(base, surface, crest);
  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createRoadGuideModel(length: number, selected: boolean): THREE.Group {
  const guideLength = Math.max(length * 0.8 - GUIDE_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `guide:${guideLength.toFixed(4)}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group = new THREE.Group();
  const base = new THREE.Mesh(
    getRoadDeckGeometry(`guide-deck:${guideLength.toFixed(4)}`, guideLength, 0.42, 0.28, 0.08),
    getSharedMaterial(`guide-base:${selected ? 1 : 0}`, {
      color: selected ? "#ffd68a" : "#f5d06f",
      roughness: 0.54,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.96 : 0.76,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.42 : 0.24
    })
  );
  const lane = new THREE.Mesh(
    getBoxGeometry(`guide-lane:${guideLength.toFixed(4)}`, guideLength * 0.78, 0.018, 0.08),
    getSharedMaterial(`guide-lane:${selected ? 1 : 0}`, {
      color: selected ? "#fff2bf" : "#ffe39c",
      roughness: 0.44,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.94 : 0.72
    })
  );
  lane.position.y = 0.05;

  group.add(base, lane);
  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createBuildingPieceModel(type: "settlement" | "city", color: string): THREE.Group {
  const cacheKey = `${type}:${color}`;
  const cached = buildingTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const mainMaterial = getSharedMaterial(`building-main:${color}`, {
    color,
    roughness: 0.6,
    metalness: 0.04
  });
  const sideMaterial = getSharedMaterial(`building-side:${color}`, {
    color: shadeColor(color, -0.14),
    roughness: 0.76,
    metalness: 0.02
  });
  const accentMaterial = getSharedMaterial(`building-accent:${color}`, {
    color: shadeColor(color, 0.1),
    roughness: 0.52,
    metalness: 0.04
  });
  const trimMaterial = getSharedMaterial(`building-trim:${color}`, {
    color: shadeColor(color, -0.24),
    roughness: 0.82,
    metalness: 0.02
  });

  const group = type === "city"
    ? createCityPiece(mainMaterial, sideMaterial, accentMaterial, trimMaterial)
    : createSettlementPiece(mainMaterial, sideMaterial, accentMaterial, trimMaterial);

  markObjectResourcesShared(group);
  buildingTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

function createSettlementPiece(
  mainMaterial: THREE.MeshStandardMaterial,
  sideMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial,
  trimMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("settlement-plinth", 1.16, 0.12, 0.84), sideMaterial);
  plinth.position.y = 0.06;

  const shell = new THREE.Mesh(
    getHouseGeometry("settlement-shell", 1.04, 0.64, 1.16, 0.56),
    [mainMaterial, sideMaterial]
  );
  shell.position.y = 0.12;

  const door = new THREE.Mesh(getBoxGeometry("settlement-door", 0.18, 0.3, 0.06), accentMaterial);
  door.position.set(0, 0.31, 0.31);

  const chimney = new THREE.Mesh(getBoxGeometry("settlement-chimney", 0.12, 0.28, 0.12), trimMaterial);
  chimney.position.set(0.22, 0.92, 0.08);

  const sill = new THREE.Mesh(getBoxGeometry("settlement-sill", 0.54, 0.06, 0.08), trimMaterial);
  sill.position.set(0, 0.74, 0.14);

  group.add(plinth, shell, door, chimney, sill);
  return group;
}

function createCityPiece(
  mainMaterial: THREE.MeshStandardMaterial,
  sideMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial,
  trimMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("city-plinth", 1.54, 0.14, 0.96), sideMaterial);
  plinth.position.y = 0.07;

  const hall = new THREE.Mesh(
    getHouseGeometry("city-hall", 0.98, 0.62, 1.02, 0.6),
    [mainMaterial, sideMaterial]
  );
  hall.position.set(-0.18, 0.14, 0);

  const tower = new THREE.Mesh(
    getHouseGeometry("city-tower", 0.56, 0.92, 1.48, 0.48),
    [accentMaterial, sideMaterial]
  );
  tower.position.set(0.42, 0.14, 0);

  const connector = new THREE.Mesh(getBoxGeometry("city-connector", 0.3, 0.28, 0.5), trimMaterial);
  connector.position.set(0.14, 0.42, 0);

  const gate = new THREE.Mesh(getBoxGeometry("city-gate", 0.18, 0.34, 0.06), accentMaterial);
  gate.position.set(-0.18, 0.32, 0.33);

  const towerCap = new THREE.Mesh(getBoxGeometry("city-cap", 0.34, 0.1, 0.42), trimMaterial);
  towerCap.position.set(0.42, 1.36, 0);

  const parapet = new THREE.Mesh(getBoxGeometry("city-parapet", 0.46, 0.06, 0.08), trimMaterial);
  parapet.position.set(-0.18, 0.8, 0.18);

  group.add(plinth, hall, tower, connector, gate, towerCap, parapet);
  return group;
}

function getRoadDeckGeometry(
  cacheKey: string,
  length: number,
  bottomWidth: number,
  topWidth: number,
  height: number
): THREE.ExtrudeGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.ExtrudeGeometry) {
    return cached;
  }

  const halfBottom = bottomWidth / 2;
  const halfTop = topWidth / 2;
  const halfHeight = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfBottom, -halfHeight);
  shape.lineTo(halfBottom, -halfHeight);
  shape.lineTo(halfTop, halfHeight);
  shape.lineTo(-halfTop, halfHeight);
  shape.closePath();

  const geometry = markSharedResource(new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.014,
    bevelThickness: 0.016,
    curveSegments: 1
  }));
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-length / 2, 0, 0);
  sharedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getHouseGeometry(
  cacheKey: string,
  width: number,
  eaveHeight: number,
  totalHeight: number,
  depth: number
): THREE.ExtrudeGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.ExtrudeGeometry) {
    return cached;
  }

  const halfWidth = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(-halfWidth, eaveHeight);
  shape.lineTo(0, totalHeight);
  shape.lineTo(halfWidth, eaveHeight);
  shape.lineTo(halfWidth, 0);
  shape.closePath();

  const geometry = markSharedResource(new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.028,
    bevelThickness: 0.028,
    curveSegments: 1
  }));
  geometry.translate(0, 0, -depth / 2);
  sharedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getBoxGeometry(cacheKey: string, width: number, height: number, depth: number): THREE.BoxGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.BoxGeometry) {
    return cached;
  }

  const geometry = markSharedResource(new THREE.BoxGeometry(width, height, depth));
  sharedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getSharedMaterial(
  cacheKey: string,
  parameters: THREE.MeshStandardMaterialParameters
): THREE.MeshStandardMaterial {
  const cached = sharedMaterialCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const material = markSharedResource(new THREE.MeshStandardMaterial(parameters));
  sharedMaterialCache.set(cacheKey, material);
  return material;
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
    }
  });
}

function markSharedResource<T extends { userData: Record<string, unknown> }>(resource: T): T {
  resource.userData[SHARED_RESOURCE_FLAG] = true;
  return resource;
}

function shadeColor(color: string, lightnessOffset: number): string {
  const shaded = new THREE.Color(color);
  shaded.offsetHSL(0, 0, lightnessOffset);
  return `#${shaded.getHexString()}`;
}
