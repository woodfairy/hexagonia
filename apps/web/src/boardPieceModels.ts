import * as THREE from "three";
import type { BoardPieceStyle } from "./boardVisuals";

const SHARED_RESOURCE_FLAG = "__sharedResource";
const roadTemplateCache = new Map<string, THREE.Group>();
const buildingTemplateCache = new Map<string, THREE.Group>();
const sharedGeometryCache = new Map<string, THREE.BufferGeometry>();
const sharedMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

const BUILT_ROAD_CLEARANCE = 0.24;
const GUIDE_ROAD_CLEARANCE = 0.14;

export const BUILT_ROAD_ELEVATION = 0.12;
export const GUIDE_ROAD_ELEVATION = 0.06;

export function createRoadPieceModel(
  length: number,
  color: string,
  selected: boolean,
  style: BoardPieceStyle = "stylized"
): THREE.Group {
  const roadLength = Math.max(length * 0.84 - BUILT_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `road:${style}:${roadLength.toFixed(4)}:${color}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "minimal"
      ? createMinimalRoadPiece(roadLength, color, selected)
      : createStylizedRoadPiece(roadLength, color, selected);

  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createRoadGuideModel(
  length: number,
  selected: boolean,
  style: BoardPieceStyle = "stylized"
): THREE.Group {
  const guideLength = Math.max(length * 0.8 - GUIDE_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `guide:${style}:${guideLength.toFixed(4)}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "minimal"
      ? createMinimalRoadGuide(guideLength, selected)
      : createStylizedRoadGuide(guideLength, selected);

  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createBuildingPieceModel(
  type: "settlement" | "city",
  color: string,
  style: BoardPieceStyle = "stylized"
): THREE.Group {
  const cacheKey = `${type}:${color}:${style}`;
  const cached = buildingTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "minimal"
      ? createMinimalBuildingPiece(type, color)
      : createStylizedBuildingPiece(type, color);

  markObjectResourcesShared(group);
  buildingTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

function createMinimalRoadPiece(roadLength: number, color: string, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const keel = new THREE.Mesh(
    getRoadBodyGeometry(`road-min-keel:${roadLength.toFixed(4)}`, roadLength, 0.36, 0.22, 0.14, 0.12),
    getSharedMaterial(`road-min-keel:${color}`, {
      color: shadeColor(color, -0.24),
      roughness: 0.9,
      metalness: 0.02
    })
  );
  keel.position.y = 0.028;

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`road-min-body:${roadLength.toFixed(4)}`, roadLength * 0.94, 0.28, 0.18, 0.18, 0.12),
    getSharedMaterial(`road-min-body:${color}:${selected ? 1 : 0}`, {
      color,
      roughness: 0.72,
      metalness: 0.03,
      emissive: new THREE.Color(selected ? "#ffcb74" : shadeColor(color, -0.12)),
      emissiveIntensity: selected ? 0.28 : 0.03
    })
  );
  body.position.y = 0.104;

  const crest = new THREE.Mesh(
    getRoadBodyGeometry(`road-min-crest:${roadLength.toFixed(4)}`, roadLength * 0.8, 0.16, 0.1, 0.08, 0.06),
    getSharedMaterial(`road-min-crest:${color}:${selected ? 1 : 0}`, {
      color: shadeColor(color, 0.12),
      roughness: 0.62,
      metalness: 0.04,
      emissive: new THREE.Color(selected ? "#ffd991" : "#000000"),
      emissiveIntensity: selected ? 0.14 : 0
    })
  );
  crest.position.y = 0.17;

  group.add(keel, body, crest);
  return group;
}

function createStylizedRoadPiece(roadLength: number, color: string, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const keel = new THREE.Mesh(
    getRoadBodyGeometry(`road-stylized-keel:${roadLength.toFixed(4)}`, roadLength, 0.5, 0.32, 0.16, 0.08),
    getSharedMaterial(`road-stylized-base:${color}`, {
      color: shadeColor(color, -0.28),
      roughness: 0.9,
      metalness: 0.02
    })
  );
  keel.position.y = 0.03;

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`road-stylized-body:${roadLength.toFixed(4)}`, roadLength, 0.38, 0.22, 0.2, 0.13),
    getSharedMaterial(`road-stylized-body:${color}:${selected ? 1 : 0}`, {
      color,
      roughness: 0.72,
      metalness: 0.04,
      emissive: new THREE.Color(selected ? "#ffcb74" : shadeColor(color, -0.2)),
      emissiveIntensity: selected ? 0.3 : 0.04
    })
  );
  body.position.y = 0.11;

  const leftTrack = new THREE.Mesh(
    getBoxGeometry(`road-stylized-track:${roadLength.toFixed(4)}`, roadLength * 0.76, 0.028, 0.07),
    getSharedMaterial(`road-stylized-track:${color}:${selected ? 1 : 0}`, {
      color: shadeColor(color, 0.16),
      roughness: 0.62,
      metalness: 0.05,
      emissive: new THREE.Color(selected ? "#ffd78d" : "#000000"),
      emissiveIntensity: selected ? 0.18 : 0
    })
  );
  leftTrack.position.set(0, 0.196, -0.082);

  const rightTrack = new THREE.Mesh(
    getBoxGeometry(`road-stylized-track:${roadLength.toFixed(4)}`, roadLength * 0.76, 0.028, 0.07),
    getSharedMaterial(`road-stylized-track:${color}:${selected ? 1 : 0}`, {
      color: shadeColor(color, 0.16),
      roughness: 0.62,
      metalness: 0.05,
      emissive: new THREE.Color(selected ? "#ffd78d" : "#000000"),
      emissiveIntensity: selected ? 0.18 : 0
    })
  );
  rightTrack.position.set(0, 0.196, 0.082);

  group.add(keel, body, leftTrack, rightTrack);
  return group;
}

function createMinimalRoadGuide(guideLength: number, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`guide-min:${guideLength.toFixed(4)}`, guideLength, 0.34, 0.2, 0.1, 0.08),
    getSharedMaterial(`guide-min:${selected ? 1 : 0}`, {
      color: selected ? "#ffe2a4" : "#f3d486",
      roughness: 0.56,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.92 : 0.72,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.32 : 0.18
    })
  );
  body.position.y = 0.052;

  group.add(body);
  return group;
}

function createStylizedRoadGuide(guideLength: number, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`guide-stylized-body:${guideLength.toFixed(4)}`, guideLength, 0.42, 0.24, 0.12, 0.08),
    getSharedMaterial(`guide-stylized-base:${selected ? 1 : 0}`, {
      color: selected ? "#ffd68a" : "#f5d06f",
      roughness: 0.58,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.94 : 0.72,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.36 : 0.2
    })
  );
  body.position.y = 0.06;

  const leftTrack = new THREE.Mesh(
    getBoxGeometry(`guide-stylized-track:${guideLength.toFixed(4)}`, guideLength * 0.68, 0.018, 0.055),
    getSharedMaterial(`guide-stylized-track:${selected ? 1 : 0}`, {
      color: selected ? "#fff2bf" : "#ffe39c",
      roughness: 0.44,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.9 : 0.68
    })
  );
  leftTrack.position.set(0, 0.12, -0.062);

  const rightTrack = new THREE.Mesh(
    getBoxGeometry(`guide-stylized-track:${guideLength.toFixed(4)}`, guideLength * 0.68, 0.018, 0.055),
    getSharedMaterial(`guide-stylized-track:${selected ? 1 : 0}`, {
      color: selected ? "#fff2bf" : "#ffe39c",
      roughness: 0.44,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.9 : 0.68
    })
  );
  rightTrack.position.set(0, 0.12, 0.062);

  group.add(body, leftTrack, rightTrack);
  return group;
}

function createMinimalBuildingPiece(type: "settlement" | "city", color: string): THREE.Group {
  const mainMaterial = getSharedMaterial(`building-min-main:${color}`, {
    color,
    roughness: 0.72,
    metalness: 0.03
  });
  const sideMaterial = getSharedMaterial(`building-min-side:${color}`, {
    color: shadeColor(color, -0.22),
    roughness: 0.84,
    metalness: 0.02
  });
  const highlightMaterial = getSharedMaterial(`building-min-highlight:${color}`, {
    color: shadeColor(color, 0.1),
    roughness: 0.62,
    metalness: 0.03
  });

  return type === "city"
    ? createMinimalCityPiece(mainMaterial, sideMaterial, highlightMaterial)
    : createMinimalSettlementPiece(mainMaterial, sideMaterial, highlightMaterial);
}

function createStylizedBuildingPiece(type: "settlement" | "city", color: string): THREE.Group {
  const wallMaterial = getSharedMaterial(`building-wall:${color}`, {
    color,
    roughness: 0.66,
    metalness: 0.04
  });
  const roofMaterial = getSharedMaterial(`building-roof:${color}`, {
    color: shadeColor(color, -0.2),
    roughness: 0.74,
    metalness: 0.02
  });
  const trimMaterial = getSharedMaterial(`building-trim:${color}`, {
    color: shadeColor(color, 0.14),
    roughness: 0.58,
    metalness: 0.04
  });
  const shadowMaterial = getSharedMaterial(`building-shadow:${color}`, {
    color: shadeColor(color, -0.3),
    roughness: 0.82,
    metalness: 0.02
  });
  const accentMaterial = getSharedMaterial(`building-accent:${color}`, {
    color: shadeColor(color, 0.04),
    roughness: 0.6,
    metalness: 0.03
  });

  return type === "city"
    ? createStylizedCityPiece(wallMaterial, roofMaterial, trimMaterial, shadowMaterial, accentMaterial)
    : createStylizedSettlementPiece(wallMaterial, roofMaterial, trimMaterial, shadowMaterial, accentMaterial);
}

function createMinimalSettlementPiece(
  mainMaterial: THREE.MeshStandardMaterial,
  sideMaterial: THREE.MeshStandardMaterial,
  highlightMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const footing = new THREE.Mesh(getBoxGeometry("settlement-min-footing", 0.92, 0.08, 0.68), sideMaterial);
  footing.position.y = 0.04;

  const shell = new THREE.Mesh(
    getHouseSilhouetteGeometry("settlement-min-shell", 0.74, 0.42, 0.92, 0.54),
    [mainMaterial, sideMaterial]
  );
  shell.position.y = 0.08;

  const lintel = new THREE.Mesh(getBoxGeometry("settlement-min-lintel", 0.28, 0.07, 0.05), highlightMaterial);
  lintel.position.set(0, 0.44, 0.29);

  group.add(footing, shell, lintel);
  return group;
}

function createStylizedSettlementPiece(
  wallMaterial: THREE.MeshStandardMaterial,
  roofMaterial: THREE.MeshStandardMaterial,
  trimMaterial: THREE.MeshStandardMaterial,
  shadowMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("settlement-plinth", 1.06, 0.1, 0.8), shadowMaterial);
  plinth.position.y = 0.06;

  const body = new THREE.Mesh(getBoxGeometry("settlement-body", 0.76, 0.48, 0.56), wallMaterial);
  body.position.y = 0.34;

  const roof = new THREE.Mesh(getGableRoofGeometry("settlement-roof", 0.94, 0.4, 0.74), roofMaterial);
  roof.position.y = 0.58;

  const step = new THREE.Mesh(getBoxGeometry("settlement-step", 0.3, 0.05, 0.14), shadowMaterial);
  step.position.set(0, 0.125, 0.31);

  const door = new THREE.Mesh(getBoxGeometry("settlement-door", 0.18, 0.24, 0.06), accentMaterial);
  door.position.set(0, 0.24, 0.31);

  const lintel = new THREE.Mesh(getBoxGeometry("settlement-lintel", 0.34, 0.05, 0.08), trimMaterial);
  lintel.position.set(0, 0.48, 0.24);

  const chimney = new THREE.Mesh(getBoxGeometry("settlement-chimney", 0.1, 0.22, 0.1), trimMaterial);
  chimney.position.set(0.18, 0.8, -0.02);

  group.add(plinth, body, roof, step, door, lintel, chimney);
  return group;
}

function createMinimalCityPiece(
  mainMaterial: THREE.MeshStandardMaterial,
  sideMaterial: THREE.MeshStandardMaterial,
  highlightMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const footing = new THREE.Mesh(getBoxGeometry("city-min-footing", 1.18, 0.08, 0.76), sideMaterial);
  footing.position.y = 0.04;

  const hall = new THREE.Mesh(
    getHouseSilhouetteGeometry("city-min-hall", 0.7, 0.4, 0.86, 0.5),
    [mainMaterial, sideMaterial]
  );
  hall.position.set(-0.18, 0.08, 0.02);

  const tower = new THREE.Mesh(
    getHouseSilhouetteGeometry("city-min-tower", 0.42, 0.54, 1.08, 0.4),
    [highlightMaterial, sideMaterial]
  );
  tower.position.set(0.24, 0.08, -0.02);

  const connector = new THREE.Mesh(getBoxGeometry("city-min-connector", 0.22, 0.18, 0.28), mainMaterial);
  connector.position.set(0.03, 0.22, 0.06);

  const beam = new THREE.Mesh(getBoxGeometry("city-min-beam", 0.34, 0.07, 0.05), highlightMaterial);
  beam.position.set(-0.18, 0.4, 0.28);

  group.add(footing, hall, tower, connector, beam);
  return group;
}

function createStylizedCityPiece(
  wallMaterial: THREE.MeshStandardMaterial,
  roofMaterial: THREE.MeshStandardMaterial,
  trimMaterial: THREE.MeshStandardMaterial,
  shadowMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("city-plinth", 1.34, 0.12, 0.96), shadowMaterial);
  plinth.position.y = 0.06;

  const hall = new THREE.Mesh(getBoxGeometry("city-hall", 0.68, 0.5, 0.56), wallMaterial);
  hall.position.set(-0.22, 0.37, 0.02);

  const hallRoof = new THREE.Mesh(getGableRoofGeometry("city-hall-roof", 0.86, 0.36, 0.74), roofMaterial);
  hallRoof.position.set(-0.22, 0.62, 0.02);

  const annex = new THREE.Mesh(getBoxGeometry("city-annex", 0.34, 0.34, 0.4), accentMaterial);
  annex.position.set(0.06, 0.29, 0.18);

  const annexRoof = new THREE.Mesh(getGableRoofGeometry("city-annex-roof", 0.48, 0.22, 0.52), trimMaterial);
  annexRoof.position.set(0.06, 0.46, 0.18);

  const tower = new THREE.Mesh(getBoxGeometry("city-tower", 0.42, 0.84, 0.42), wallMaterial);
  tower.position.set(0.33, 0.49, -0.06);

  const towerRoof = new THREE.Mesh(getGableRoofGeometry("city-tower-roof", 0.56, 0.34, 0.56), roofMaterial);
  towerRoof.position.set(0.33, 0.91, -0.06);

  const gate = new THREE.Mesh(getBoxGeometry("city-gate", 0.18, 0.24, 0.06), accentMaterial);
  gate.position.set(-0.22, 0.22, 0.33);

  const hallBeam = new THREE.Mesh(getBoxGeometry("city-hall-beam", 0.44, 0.05, 0.08), trimMaterial);
  hallBeam.position.set(-0.22, 0.53, 0.25);

  const towerChimney = new THREE.Mesh(getBoxGeometry("city-tower-chimney", 0.09, 0.18, 0.09), trimMaterial);
  towerChimney.position.set(0.42, 1.02, -0.01);

  group.add(plinth, hall, hallRoof, annex, annexRoof, tower, towerRoof, gate, hallBeam, towerChimney);
  return group;
}

function getRoadBodyGeometry(
  cacheKey: string,
  length: number,
  bottomWidth: number,
  topWidth: number,
  height: number,
  crownWidth: number
): THREE.ExtrudeGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.ExtrudeGeometry) {
    return cached;
  }

  const halfBottom = bottomWidth / 2;
  const halfTop = topWidth / 2;
  const halfCrown = crownWidth / 2;
  const halfHeight = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfBottom, -halfHeight);
  shape.lineTo(-halfTop, -halfHeight * 0.08);
  shape.lineTo(-halfCrown, halfHeight);
  shape.lineTo(halfCrown, halfHeight);
  shape.lineTo(halfTop, -halfHeight * 0.08);
  shape.lineTo(halfBottom, -halfHeight);
  shape.closePath();

  const geometry = markSharedResource(
    new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.012,
      bevelThickness: 0.014,
      curveSegments: 1
    })
  );
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-length / 2, 0, 0);
  sharedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getHouseSilhouetteGeometry(
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

  const geometry = markSharedResource(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.024,
      bevelThickness: 0.024,
      curveSegments: 1
    })
  );
  geometry.translate(0, 0, -depth / 2);
  sharedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getGableRoofGeometry(cacheKey: string, width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.ExtrudeGeometry) {
    return cached;
  }

  const halfWidth = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(0, height);
  shape.lineTo(halfWidth, 0);
  shape.closePath();

  const geometry = markSharedResource(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.028,
      bevelThickness: 0.028,
      curveSegments: 1
    })
  );
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
