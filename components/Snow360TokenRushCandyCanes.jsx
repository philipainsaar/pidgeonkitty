"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * SNOW360 TOKEN RUSH | ice-cream candy-cane route signposts
 *
 * Decorative only: no colliders, no physics influence, no extra GLB/PNG.
 * A pair of pastel-striped canes frames each actual token-route hairpin.
 * One shared instanced mesh and a tiny procedural color texture per chunk.
 */
function makeCaneTexture() {
  const width = 96;
  const height = 64;
  const pixels = new Uint8Array(width * height * 4);
  const cream = [255, 249, 236];
  const strawberry = [255, 125, 177];
  const mint = [157, 241, 218];
  const lavender = [207, 180, 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Longitudinal stripes wrap diagonally around the tubular cane.
      // UV.x runs along the cane, UV.y around its circumference.
      const phase = ((x / width) * 7 + (y / height) * 1.6) % 1;
      let c;
      if (phase < 0.33) c = strawberry;
      else if (phase < 0.63) c = cream;
      else if (phase < 0.81) c = mint;
      else c = lavender;
      const at = (y * width + x) * 4;
      pixels[at] = c[0]; pixels[at + 1] = c[1];
      pixels[at + 2] = c[2]; pixels[at + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeCaneGeometry() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, .55, 0),
    new THREE.Vector3(0, 1.25, 0),
    new THREE.Vector3(0, 2.02, 0),
    new THREE.Vector3(.16, 2.36, 0),
    new THREE.Vector3(.57, 2.51, 0),
    new THREE.Vector3(.88, 2.30, 0),
    new THREE.Vector3(.94, 2.04, 0),
  ], false, "catmullrom", .24);
  return new THREE.TubeGeometry(path, 26, .135, 8, false);
}

export default function Snow360TokenRushCandyCanes({ markers = [], groundY }) {
  const canes = useRef(null);
  const pearls = useRef(null);
  const texture = useMemo(makeCaneTexture, []);
  const geometry = useMemo(makeCaneGeometry, []);
  const pearlGeometry = useMemo(() => {
    const g = new THREE.SphereGeometry(.19, 10, 7);
    g.translate(.94, 2.05, 0);
    return g;
  }, []);
  const pearlMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#ffedb6", emissive: "#ffe1a1", emissiveIntensity: .38,
    roughness: .23, metalness: .08,
  }), []);
  const candyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    name: "Snow360_PastelCandyCane_AnimatedStripes",
    map: texture, color: "#ffffff", roughness: .31, metalness: .03,
    emissive: "#bd88a2", emissiveIntensity: .12,
  }), [texture]);

  useLayoutEffect(() => {
    if (!markers.length || !canes.current || !pearls.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const axis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      position.set(marker.x, groundY(marker.x, marker.z) - .03, marker.z);
      // Hook curves inward toward the slalom token path.
      orientation.setFromAxisAngle(axis, marker.side < 0 ? 0 : Math.PI);
      matrix.compose(position, orientation, scale);
      canes.current.setMatrixAt(i, matrix);
      pearls.current.setMatrixAt(i, matrix);
    }
    canes.current.instanceMatrix.needsUpdate = true;
    pearls.current.instanceMatrix.needsUpdate = true;
  }, [markers, groundY]);

  useFrame((state, dt) => {
    // A slow moving candy-stripe pattern and gentle pearl shimmer.
    texture.offset.x = (texture.offset.x + Math.min(dt, .06) * .085) % 1;
    const t = state.clock.elapsedTime;
    pearlMaterial.emissiveIntensity = .32 + .19 * (0.5 + 0.5 * Math.sin(t * 2.6));
  });

  useEffect(() => () => {
    geometry.dispose();
    pearlGeometry.dispose();
    candyMaterial.dispose();
    pearlMaterial.dispose();
    texture.dispose();
  }, [geometry, pearlGeometry, candyMaterial, pearlMaterial, texture]);

  if (!markers.length) return null;
  return <group name="Snow360 Token Rush Candy-Cane Corner Guides">
    <instancedMesh ref={canes} args={[geometry, candyMaterial, markers.length]}
      frustumCulled={false} castShadow={false} receiveShadow={false} />
    <instancedMesh ref={pearls} args={[pearlGeometry, pearlMaterial, markers.length]}
      frustumCulled={false} castShadow={false} receiveShadow={false} />
  </group>;
}
