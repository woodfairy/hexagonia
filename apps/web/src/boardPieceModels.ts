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
  style: BoardPieceStyle = "modern"
): THREE.Group {
  const roadLength = Math.max(length * 0.84 - BUILT_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `road:${style}:${roadLength.toFixed(4)}:${color}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "modern"
      ? createModernRoadPiece(roadLength, color, selected)
      : createDetailedRoadPiece(roadLength, color, selected);

  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createRoadGuideModel(
  length: number,
  selected: boolean,
  style: BoardPieceStyle = "modern"
): THREE.Group {
  const guideLength = Math.max(length * 0.8 - GUIDE_ROAD_CLEARANCE * 2, 0.1);
  const cacheKey = `guide:${style}:${guideLength.toFixed(4)}:${selected ? 1 : 0}`;
  const cached = roadTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "modern"
      ? createModernRoadGuide(guideLength, selected)
      : createDetailedRoadGuide(guideLength, selected);

  markObjectResourcesShared(group);
  roadTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

export function createBuildingPieceModel(
  type: "settlement" | "city",
  color: string,
  style: BoardPieceStyle = "modern"
): THREE.Group {
  const cacheKey = `${type}:${color}:${style}`;
  const cached = buildingTemplateCache.get(cacheKey);
  if (cached) {
    return cloneSharedTemplate(cached);
  }

  const group =
    style === "modern"
      ? createModernBuildingPiece(type, color)
      : createDetailedBuildingPiece(type, color);

  markObjectResourcesShared(group);
  buildingTemplateCache.set(cacheKey, group);
  return cloneSharedTemplate(group);
}

interface ModernBuildingMaterials {
  wallMaterial: THREE.MeshStandardMaterial;
  roofMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  shadowMaterial: THREE.MeshStandardMaterial;
  accentMaterial: THREE.MeshStandardMaterial;
}

interface DetailedBuildingMaterials {
  wallMaterial: THREE.MeshStandardMaterial;
  roofMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  baseMaterial: THREE.MeshStandardMaterial;
  accentMaterial: THREE.MeshStandardMaterial;
}

interface ReliefSectionOptions {
  cacheKey: string;
  width: number;
  bodyHeight: number;
  roofHeight: number;
  depth: number;
  panelCount: number;
  doorway?: boolean;
}

function createModernRoadPiece(roadLength: number, color: string, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const keel = new THREE.Mesh(
    getRoadBodyGeometry(`road-modern-keel:${roadLength.toFixed(4)}`, roadLength, 0.36, 0.22, 0.14, 0.12),
    getSharedMaterial(`road-modern-keel:${color}`, {
      color: shadeColor(color, -0.24),
      roughness: 0.9,
      metalness: 0.02
    })
  );
  keel.position.y = 0.028;

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`road-modern-body:${roadLength.toFixed(4)}`, roadLength * 0.94, 0.28, 0.18, 0.18, 0.12),
    getSharedMaterial(`road-modern-body:${color}:${selected ? 1 : 0}`, {
      color,
      roughness: 0.72,
      metalness: 0.03,
      emissive: new THREE.Color(selected ? "#ffcb74" : shadeColor(color, -0.12)),
      emissiveIntensity: selected ? 0.28 : 0.03
    })
  );
  body.position.y = 0.104;

  const crest = new THREE.Mesh(
    getRoadBodyGeometry(`road-modern-crest:${roadLength.toFixed(4)}`, roadLength * 0.8, 0.16, 0.1, 0.08, 0.06),
    getSharedMaterial(`road-modern-crest:${color}:${selected ? 1 : 0}`, {
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

function createDetailedRoadPiece(roadLength: number, color: string, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    getRoadBodyGeometry(`road-detailed-base:${roadLength.toFixed(4)}`, roadLength, 0.62, 0.52, 0.14, 0.42),
    getSharedMaterial(`road-detailed-base:${color}`, {
      color: shadeColor(color, -0.2),
      roughness: 0.92,
      metalness: 0.01
    })
  );
  base.position.y = 0.028;

  const cap = new THREE.Mesh(
    getRoadBodyGeometry(`road-detailed-cap:${roadLength.toFixed(4)}`, roadLength * 0.94, 0.48, 0.42, 0.08, 0.3),
    getSharedMaterial(`road-detailed-cap:${color}:${selected ? 1 : 0}`, {
      color,
      roughness: 0.82,
      metalness: 0.02,
      emissive: new THREE.Color(selected ? "#ffcb74" : shadeColor(color, -0.2)),
      emissiveIntensity: selected ? 0.24 : 0.03
    })
  );
  cap.position.y = 0.094;

  const topMaterial = getSharedMaterial(`road-detailed-top:${color}:${selected ? 1 : 0}`, {
    color: shadeColor(color, 0.06),
    roughness: 0.8,
    metalness: 0.02,
    emissive: new THREE.Color(selected ? "#ffd991" : "#000000"),
    emissiveIntensity: selected ? 0.12 : 0
  });
  const reliefMaterial = getSharedMaterial(`road-detailed-relief:${color}:${selected ? 1 : 0}`, {
    color: shadeColor(color, 0.2),
    roughness: 0.74,
    metalness: 0.02,
    emissive: new THREE.Color(selected ? "#ffe6b8" : "#000000"),
    emissiveIntensity: selected ? 0.08 : 0
  });

  group.add(base, cap, ...createDetailedRoadReliefMeshes(roadLength, "road-detailed", topMaterial, reliefMaterial));
  return group;
}

function createModernRoadGuide(guideLength: number, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    getRoadBodyGeometry(`guide-modern:${guideLength.toFixed(4)}`, guideLength, 0.34, 0.2, 0.1, 0.08),
    getSharedMaterial(`guide-modern:${selected ? 1 : 0}`, {
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

function createDetailedRoadGuide(guideLength: number, selected: boolean): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    getRoadBodyGeometry(`guide-detailed-base:${guideLength.toFixed(4)}`, guideLength, 0.6, 0.5, 0.1, 0.38),
    getSharedMaterial(`guide-detailed-base:${selected ? 1 : 0}`, {
      color: selected ? "#ffd68a" : "#f5d06f",
      roughness: 0.62,
      metalness: 0.02,
      transparent: true,
      opacity: selected ? 0.9 : 0.68,
      emissive: new THREE.Color("#f0a93a"),
      emissiveIntensity: selected ? 0.34 : 0.18
    })
  );
  base.position.y = 0.05;

  const topMaterial = getSharedMaterial(`guide-detailed-top:${selected ? 1 : 0}`, {
    color: selected ? "#fff2bf" : "#ffe39c",
    roughness: 0.46,
    metalness: 0.02,
    transparent: true,
    opacity: selected ? 0.88 : 0.64
  });
  const reliefMaterial = getSharedMaterial(`guide-detailed-relief:${selected ? 1 : 0}`, {
    color: selected ? "#fff7d2" : "#fff0bd",
    roughness: 0.42,
    metalness: 0.02,
    transparent: true,
    opacity: selected ? 0.84 : 0.58
  });

  group.add(base, ...createDetailedRoadReliefMeshes(guideLength, "guide-detailed", topMaterial, reliefMaterial, 0.102, 0.116));
  return group;
}

function createModernBuildingPiece(type: "settlement" | "city", color: string): THREE.Group {
  const materials: ModernBuildingMaterials = {
    wallMaterial: getSharedMaterial(`building-modern-wall:${color}`, {
      color,
      roughness: 0.66,
      metalness: 0.04
    }),
    roofMaterial: getSharedMaterial(`building-modern-roof:${color}`, {
      color: shadeColor(color, -0.2),
      roughness: 0.74,
      metalness: 0.02
    }),
    trimMaterial: getSharedMaterial(`building-modern-trim:${color}`, {
      color: shadeColor(color, 0.14),
      roughness: 0.58,
      metalness: 0.04
    }),
    shadowMaterial: getSharedMaterial(`building-modern-shadow:${color}`, {
      color: shadeColor(color, -0.3),
      roughness: 0.82,
      metalness: 0.02
    }),
    accentMaterial: getSharedMaterial(`building-modern-accent:${color}`, {
      color: shadeColor(color, 0.04),
      roughness: 0.6,
      metalness: 0.03
    })
  };

  return type === "city" ? createModernCityPiece(materials) : createModernSettlementPiece(materials);
}

function createDetailedBuildingPiece(type: "settlement" | "city", color: string): THREE.Group {
  const materials: DetailedBuildingMaterials = {
    wallMaterial: getSharedMaterial(`building-detailed-wall:${color}`, {
      color,
      roughness: 0.82,
      metalness: 0.02
    }),
    roofMaterial: getSharedMaterial(`building-detailed-roof:${color}`, {
      color: shadeColor(color, -0.12),
      roughness: 0.86,
      metalness: 0.01
    }),
    trimMaterial: getSharedMaterial(`building-detailed-trim:${color}`, {
      color: shadeColor(color, 0.12),
      roughness: 0.76,
      metalness: 0.02
    }),
    baseMaterial: getSharedMaterial(`building-detailed-base:${color}`, {
      color: shadeColor(color, -0.2),
      roughness: 0.9,
      metalness: 0.01
    }),
    accentMaterial: getSharedMaterial(`building-detailed-accent:${color}`, {
      color: shadeColor(color, 0.2),
      roughness: 0.72,
      metalness: 0.02
    })
  };

  return type === "city" ? createDetailedCityPiece(materials) : createDetailedSettlementPiece(materials);
}

function createModernSettlementPiece({
  wallMaterial,
  roofMaterial,
  trimMaterial,
  shadowMaterial,
  accentMaterial
}: ModernBuildingMaterials): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("modern-settlement-plinth", 1.06, 0.1, 0.8), shadowMaterial);
  plinth.position.y = 0.06;

  const body = new THREE.Mesh(getBoxGeometry("modern-settlement-body", 0.76, 0.48, 0.56), wallMaterial);
  body.position.y = 0.34;

  const roof = new THREE.Mesh(getGableRoofGeometry("modern-settlement-roof", 0.94, 0.4, 0.74), roofMaterial);
  roof.position.y = 0.58;

  const step = new THREE.Mesh(getBoxGeometry("modern-settlement-step", 0.3, 0.05, 0.14), shadowMaterial);
  step.position.set(0, 0.125, 0.31);

  const door = new THREE.Mesh(getBoxGeometry("modern-settlement-door", 0.18, 0.24, 0.06), accentMaterial);
  door.position.set(0, 0.24, 0.31);

  const lintel = new THREE.Mesh(getBoxGeometry("modern-settlement-lintel", 0.34, 0.05, 0.08), trimMaterial);
  lintel.position.set(0, 0.48, 0.24);

  const chimney = new THREE.Mesh(getBoxGeometry("modern-settlement-chimney", 0.1, 0.22, 0.1), trimMaterial);
  chimney.position.set(0.18, 0.8, -0.02);

  group.add(plinth, body, roof, step, door, lintel, chimney);
  return group;
}

function createDetailedSettlementPiece(materials: DetailedBuildingMaterials): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("detailed-settlement-plinth", 1.14, 0.12, 0.84), materials.baseMaterial);
  plinth.position.y = 0.06;

  const apron = new THREE.Mesh(getBoxGeometry("detailed-settlement-apron", 0.92, 0.04, 0.66), materials.trimMaterial);
  apron.position.set(0, 0.14, 0.02);

  const mainSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-settlement-main",
      width: 0.58,
      bodyHeight: 0.28,
      roofHeight: 0.16,
      depth: 0.52,
      panelCount: 2,
      doorway: true
    },
    materials
  );
  mainSection.position.y = 0.12;

  const leftSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-settlement-left",
      width: 0.22,
      bodyHeight: 0.16,
      roofHeight: 0.08,
      depth: 0.4,
      panelCount: 1
    },
    materials
  );
  leftSection.position.set(-0.3, 0.12, 0.02);

  const rightSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-settlement-right",
      width: 0.22,
      bodyHeight: 0.16,
      roofHeight: 0.08,
      depth: 0.4,
      panelCount: 1
    },
    materials
  );
  rightSection.position.set(0.3, 0.12, 0.02);

  const sill = new THREE.Mesh(getBoxGeometry("detailed-settlement-sill", 0.74, 0.04, 0.07), materials.baseMaterial);
  sill.position.set(0, 0.19, 0.34);

  group.add(plinth, apron, mainSection, leftSection, rightSection, sill);
  return group;
}

function createModernCityPiece({
  wallMaterial,
  roofMaterial,
  trimMaterial,
  shadowMaterial,
  accentMaterial
}: ModernBuildingMaterials): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("modern-city-plinth", 1.34, 0.12, 0.96), shadowMaterial);
  plinth.position.y = 0.06;

  const hall = new THREE.Mesh(getBoxGeometry("modern-city-hall", 0.68, 0.5, 0.56), wallMaterial);
  hall.position.set(-0.22, 0.37, 0.02);

  const hallRoof = new THREE.Mesh(getGableRoofGeometry("modern-city-hall-roof", 0.86, 0.36, 0.74), roofMaterial);
  hallRoof.position.set(-0.22, 0.62, 0.02);

  const annex = new THREE.Mesh(getBoxGeometry("modern-city-annex", 0.34, 0.34, 0.4), accentMaterial);
  annex.position.set(0.06, 0.29, 0.18);

  const annexRoof = new THREE.Mesh(getGableRoofGeometry("modern-city-annex-roof", 0.48, 0.22, 0.52), trimMaterial);
  annexRoof.position.set(0.06, 0.46, 0.18);

  const tower = new THREE.Mesh(getBoxGeometry("modern-city-tower", 0.42, 0.84, 0.42), wallMaterial);
  tower.position.set(0.33, 0.49, -0.06);

  const towerRoof = new THREE.Mesh(getGableRoofGeometry("modern-city-tower-roof", 0.56, 0.34, 0.56), roofMaterial);
  towerRoof.position.set(0.33, 0.91, -0.06);

  const gate = new THREE.Mesh(getBoxGeometry("modern-city-gate", 0.18, 0.24, 0.06), accentMaterial);
  gate.position.set(-0.22, 0.22, 0.33);

  const hallBeam = new THREE.Mesh(getBoxGeometry("modern-city-hall-beam", 0.44, 0.05, 0.08), trimMaterial);
  hallBeam.position.set(-0.22, 0.53, 0.25);

  const towerChimney = new THREE.Mesh(getBoxGeometry("modern-city-tower-chimney", 0.09, 0.18, 0.09), trimMaterial);
  towerChimney.position.set(0.42, 1.02, -0.01);

  group.add(plinth, hall, hallRoof, annex, annexRoof, tower, towerRoof, gate, hallBeam, towerChimney);
  return group;
}

function createDetailedCityPiece(materials: DetailedBuildingMaterials): THREE.Group {
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(getBoxGeometry("detailed-city-plinth", 1.52, 0.12, 0.92), materials.baseMaterial);
  plinth.position.y = 0.06;

  const apron = new THREE.Mesh(getBoxGeometry("detailed-city-apron", 1.26, 0.05, 0.74), materials.trimMaterial);
  apron.position.set(0, 0.145, 0.02);

  const leftSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-city-left",
      width: 0.42,
      bodyHeight: 0.28,
      roofHeight: 0.15,
      depth: 0.5,
      panelCount: 2
    },
    materials
  );
  leftSection.position.set(-0.34, 0.12, 0.02);

  const centerSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-city-center",
      width: 0.5,
      bodyHeight: 0.34,
      roofHeight: 0.18,
      depth: 0.58,
      panelCount: 2,
      doorway: true
    },
    materials
  );
  centerSection.position.set(0, 0.12, 0.03);

  const rightSection = createDetailedFacadeSection(
    {
      cacheKey: "detailed-city-right",
      width: 0.42,
      bodyHeight: 0.3,
      roofHeight: 0.15,
      depth: 0.5,
      panelCount: 2
    },
    materials
  );
  rightSection.position.set(0.34, 0.12, 0.02);

  const frontBand = new THREE.Mesh(getBoxGeometry("detailed-city-front-band", 1.12, 0.045, 0.07), materials.baseMaterial);
  frontBand.position.set(0, 0.23, 0.35);

  group.add(plinth, apron, leftSection, centerSection, rightSection, frontBand);
  return group;
}

function createDetailedRoadReliefMeshes(
  roadLength: number,
  keyPrefix: string,
  topMaterial: THREE.MeshStandardMaterial,
  reliefMaterial: THREE.MeshStandardMaterial,
  plateHeight = 0.132,
  reliefHeight = 0.146
): THREE.Mesh[] {
  const plate = new THREE.Mesh(
    getBoxGeometry(`${keyPrefix}-relief-cap:${roadLength.toFixed(4)}`, roadLength * 0.8, 0.016, 0.24),
    topMaterial
  );
  plate.position.set(0, plateHeight, 0);

  const peakCount = Math.max(Math.min(Math.round(roadLength / 0.22), 6), 4);
  const crest = new THREE.Mesh(
    getRoadCrestGeometry(
      `${keyPrefix}-relief-crest:${roadLength.toFixed(4)}:${peakCount}`,
      roadLength * 0.72,
      0.034,
      0.16,
      peakCount
    ),
    reliefMaterial
  );
  crest.position.set(0, reliefHeight, 0);

  return [plate, crest];
}

function createDetailedFacadeSection(
  options: ReliefSectionOptions,
  materials: DetailedBuildingMaterials
): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    getBoxGeometry(`${options.cacheKey}-body`, options.width, options.bodyHeight, options.depth),
    materials.wallMaterial
  );
  body.position.y = options.bodyHeight / 2;

  const roof = new THREE.Mesh(
    getGableRoofGeometry(`${options.cacheKey}-roof`, options.width * 1.06, options.roofHeight, options.depth * 1.04),
    materials.roofMaterial
  );
  roof.position.y = options.bodyHeight;

  const band = new THREE.Mesh(
    getBoxGeometry(`${options.cacheKey}-band`, options.width * 0.84, 0.04, 0.05),
    materials.trimMaterial
  );
  band.position.set(0, options.bodyHeight * 0.72, options.depth / 2 + 0.01);

  const sill = new THREE.Mesh(
    getBoxGeometry(`${options.cacheKey}-sill`, options.width * 0.72, 0.035, 0.045),
    materials.baseMaterial
  );
  sill.position.set(0, options.bodyHeight * 0.22, options.depth / 2 + 0.01);

  const ridge = new THREE.Mesh(
    getBoxGeometry(`${options.cacheKey}-ridge`, Math.max(options.width * 0.34, 0.1), 0.035, 0.05),
    materials.trimMaterial
  );
  ridge.position.set(0, options.bodyHeight + options.roofHeight * 0.88, 0);

  const panels = createFacadePanels(options, materials.accentMaterial);
  group.add(body, roof, band, sill, ridge, ...panels);

  if (options.doorway) {
    const door = new THREE.Mesh(
      getBoxGeometry(`${options.cacheKey}-door`, Math.max(options.width * 0.18, 0.1), options.bodyHeight * 0.42, 0.055),
      materials.baseMaterial
    );
    door.position.set(0, options.bodyHeight * 0.21, options.depth / 2 + 0.02);
    group.add(door);
  }

  return group;
}

function createFacadePanels(options: ReliefSectionOptions, material: THREE.MeshStandardMaterial): THREE.Mesh[] {
  const panelCount = Math.max(options.panelCount, 1);
  const gap = Math.min(0.05, options.width * 0.08);
  const availableWidth = options.width * 0.72 - gap * (panelCount - 1);
  const panelWidth = Math.max(availableWidth / panelCount, 0.08);
  const startX = -(panelWidth * (panelCount - 1) + gap * (panelCount - 1)) / 2;
  const frontZ = options.depth / 2 + 0.015;
  const panelHeight = Math.max(options.bodyHeight * 0.24, 0.08);
  const panelY = options.bodyHeight * 0.44;

  const panels: THREE.Mesh[] = [];
  for (let index = 0; index < panelCount; index += 1) {
    const panel = new THREE.Mesh(
      getBoxGeometry(`${options.cacheKey}-panel:${index}:${panelWidth.toFixed(3)}`, panelWidth, panelHeight, 0.04),
      material
    );
    panel.position.set(startX + index * (panelWidth + gap), panelY, frontZ);
    panels.push(panel);
  }

  return panels;
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

function getRoadCrestGeometry(
  cacheKey: string,
  length: number,
  peakHeight: number,
  depth: number,
  peakCount: number
): THREE.ExtrudeGeometry {
  const cached = sharedGeometryCache.get(cacheKey);
  if (cached instanceof THREE.ExtrudeGeometry) {
    return cached;
  }

  const usableLength = length;
  const halfLength = usableLength / 2;
  const step = usableLength / peakCount;
  const baseThickness = Math.max(peakHeight * 0.4, 0.014);
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength, -baseThickness);
  shape.lineTo(-halfLength, 0);

  for (let index = 0; index < peakCount; index += 1) {
    const segmentStart = -halfLength + step * index;
    const peakX = segmentStart + step / 2;
    const segmentEnd = segmentStart + step;
    shape.lineTo(peakX, peakHeight);
    shape.lineTo(segmentEnd, 0);
  }

  shape.lineTo(halfLength, -baseThickness);
  shape.closePath();

  const geometry = markSharedResource(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.01,
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
