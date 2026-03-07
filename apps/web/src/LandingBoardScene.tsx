import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const TILE_CONFIG = [
  { x: 0, z: 0, color: "#d5b264", lift: 0.36 },
  { x: 5.2, z: 0.15, color: "#507a4d", lift: 0.22 },
  { x: -5.2, z: -0.18, color: "#7c8da2", lift: 0.3 },
  { x: 2.65, z: 4.55, color: "#c07654", lift: 0.18 },
  { x: -2.6, z: 4.42, color: "#8ab06a", lift: 0.16 },
  { x: 2.65, z: -4.52, color: "#608ca8", lift: 0.2 },
  { x: -2.55, z: -4.42, color: "#c5a35d", lift: 0.28 }
] as const;

const ROAD_SEGMENTS = [
  { from: new THREE.Vector3(-2.8, 1.06, -1.35), to: new THREE.Vector3(0.05, 1.22, -0.05), color: "#e3bf72" },
  { from: new THREE.Vector3(0.2, 1.2, 0.05), to: new THREE.Vector3(2.8, 1.08, 1.45), color: "#8dc1dc" },
  { from: new THREE.Vector3(-1.4, 1.14, 2.85), to: new THREE.Vector3(1.42, 1.1, 3.05), color: "#d98a62" }
] as const;

export function LandingBoardScene(props: { reducedMotion: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hasFallback, setHasFallback] = useState(false);

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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const clock = new THREE.Clock();
    const boardGroup = new THREE.Group();
    const tileMeshes: Array<{ mesh: THREE.Mesh; baseY: number }> = [];
    const rings: THREE.Mesh[] = [];
    const pointer = new THREE.Vector2();
    let scrollProgress = 0;
    let frameId = 0;

    scene.add(boardGroup);
    camera.position.set(0, 12.5, 27.5);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = "landing-scene-canvas";
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#cfd8df", 1.45);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight("#f7ecd5", 2.2);
    keyLight.position.set(14, 24, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#6ab6ea", 0.8);
    fillLight.position.set(-14, 10, -12);
    scene.add(fillLight);

    const glowLight = new THREE.PointLight("#eabf74", 2.4, 34, 2);
    glowLight.position.set(0, 6, 0);
    scene.add(glowLight);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(12.8, 14.2, 1.2, 48),
      new THREE.MeshStandardMaterial({
        color: "#10222d",
        roughness: 0.92,
        metalness: 0.16
      })
    );
    base.position.y = -0.55;
    boardGroup.add(base);

    const glowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(14.8, 48),
      new THREE.MeshBasicMaterial({
        color: "#145169",
        transparent: true,
        opacity: 0.22
      })
    );
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = -0.7;
    boardGroup.add(glowPlane);

    const tileGeometry = new THREE.CylinderGeometry(2.45, 2.45, 0.92, 6);
    tileGeometry.rotateY(Math.PI / 6);
    const edgeGeometry = new THREE.TorusGeometry(2.1, 0.06, 8, 6);
    edgeGeometry.rotateX(Math.PI / 2);

    TILE_CONFIG.forEach((tile, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: tile.color,
        roughness: 0.74,
        metalness: 0.18,
        emissive: tile.color,
        emissiveIntensity: 0.16
      });
      const mesh = new THREE.Mesh(tileGeometry, material);
      const baseY = tile.lift + (index === 0 ? 0.2 : 0);
      mesh.position.set(tile.x, baseY, tile.z);
      boardGroup.add(mesh);
      tileMeshes.push({ mesh, baseY });

      const ring = new THREE.Mesh(
        edgeGeometry,
        new THREE.MeshBasicMaterial({
          color: index === 0 ? "#f2d08a" : "#9ad4e9",
          transparent: true,
          opacity: index === 0 ? 0.72 : 0.28
        })
      );
      ring.position.set(tile.x, baseY + 0.48, tile.z);
      ring.scale.setScalar(index === 0 ? 1.02 : 0.96);
      boardGroup.add(ring);
      rings.push(ring);
    });

    const settlementMaterial = new THREE.MeshStandardMaterial({
      color: "#f6eed5",
      roughness: 0.3,
      metalness: 0.08
    });
    addSettlement(boardGroup, new THREE.Vector3(-3.35, 1.52, 1.55), settlementMaterial, 1.05);
    addSettlement(boardGroup, new THREE.Vector3(3.45, 1.44, -1.35), settlementMaterial, 0.88);
    addSettlement(boardGroup, new THREE.Vector3(0.1, 1.46, 4.95), settlementMaterial, 0.98);

    ROAD_SEGMENTS.forEach((segment) => addRoad(boardGroup, segment.from, segment.to, segment.color));

    const portRing = new THREE.Mesh(
      new THREE.TorusGeometry(10.3, 0.12, 10, 60),
      new THREE.MeshBasicMaterial({
        color: "#f1cf84",
        transparent: true,
        opacity: 0.32
      })
    );
    portRing.rotation.x = -Math.PI / 2;
    portRing.position.y = 0.18;
    boardGroup.add(portRing);

    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 110;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      starPositions[index * 3] = (Math.random() - 0.5) * 34;
      starPositions[index * 3 + 1] = Math.random() * 14 + 2;
      starPositions[index * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: "#f9f0d9",
        size: 0.12,
        transparent: true,
        opacity: 0.7
      })
    );
    scene.add(stars);

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
      const motionScale = props.reducedMotion ? 0.25 : 1;
      const drift = elapsed * 0.18 * motionScale;
      const boardBob = props.reducedMotion ? 0 : Math.sin(elapsed * 0.75) * 0.18;
      const scrollLift = scrollProgress * 1.2;
      boardGroup.rotation.y = 0.44 + drift + scrollProgress * 0.34;
      boardGroup.position.y = boardBob + scrollLift * 0.05;
      glowPlane.material.opacity = 0.14 + (props.reducedMotion ? 0.02 : (Math.sin(elapsed * 1.1) + 1) * 0.05);
      portRing.rotation.z = elapsed * 0.08 * motionScale;

      tileMeshes.forEach(({ mesh, baseY }, index) => {
        const offset = props.reducedMotion ? 0 : Math.sin(elapsed * 1.25 + index * 0.7) * 0.08;
        mesh.position.y = baseY + offset;
      });

      rings.forEach((ring, index) => {
        ring.rotation.z = elapsed * (index === 0 ? 0.18 : 0.1) * motionScale;
        const material = ring.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = index === 0 ? 0.64 : 0.18 + (props.reducedMotion ? 0 : (Math.sin(elapsed + index) + 1) * 0.07);
        }
      });

      stars.rotation.y = elapsed * 0.03 * motionScale;
      const targetPosition = new THREE.Vector3(
        pointer.x * (props.reducedMotion ? 0.2 : 1.4),
        12.6 + scrollProgress * 1.4 + pointer.y * (props.reducedMotion ? 0.06 : -0.55),
        27.5 - scrollProgress * 4.8
      );
      camera.position.lerp(targetPosition, props.reducedMotion ? 0.08 : 0.045);
      camera.lookAt(pointer.x * 0.8, 1.5 + scrollProgress * 0.9, pointer.y * 0.5);

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

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) {
          return;
        }

        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
          return;
        }

        object.material.dispose();
      });

      renderer.dispose();
      mount.replaceChildren();
    };
  }, [hasFallback, props.reducedMotion]);

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

function addSettlement(group: THREE.Group, position: THREE.Vector3, material: THREE.Material, scale = 1) {
  const settlement = new THREE.Group();
  settlement.position.copy(position);
  settlement.scale.setScalar(scale);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 0.9), material);
  settlement.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.78, 0.52, 4),
    new THREE.MeshStandardMaterial({
      color: "#d9865e",
      roughness: 0.42,
      metalness: 0.06
    })
  );
  roof.position.y = 0.58;
  roof.rotation.y = Math.PI / 4;
  settlement.add(roof);

  group.add(settlement);
}

function addRoad(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, color: string) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = delta.length();
  const road = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, length, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.12,
      emissive: color,
      emissiveIntensity: 0.14
    })
  );

  road.position.copy(from).addScaledVector(delta, 0.5);
  road.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  group.add(road);
}
