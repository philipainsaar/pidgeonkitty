"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  SNOW64_MODEL_SCALE,
  SNOW64_SNOWBOARD_FOOT_TUNE,
} from "./snow64ModelConfig";

/**
 * SNOW360 V77: visible crystal-style glow on the ACTUAL snowboard.
 *
 * V76's two thin BackSide outline shells were mostly invisible from the
 * default behind-the-rider camera. These shells remain for a close-up edge
 * highlight; a NEW three-part, camera-facing, radially feathered additive
 * aura supplies the clearly visible glow seen around collectible crystals.
 *
 * The glow consists of translucent textures with alpha fading to ZERO at
 * the outer boundary, NOT opaque rectangular planes.
 *
 * Nothing changes the original GLB, UVs, face texture, snowboard colors,
 * material settings, foot alignment, rider animation or collision.
 */

const DECK_NAME = /WHITE_CLOUD_PLUSH_TOP|PINK_BLUE_PLUSH_BOTTOM/i;

// Center-weighted, crystal-style soft halo texture, generated only once.
function createHaloTexture() {
  const n = 96;
  const pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n * 0.5) / (n * 0.5);
      const dy = (y + 0.5 - n * 0.5) / (n * 0.5);
      const r2 = dx * dx + dy * dy;
      // Same radial glow family used for crystal pickup auras.
      // Subtract edge value so there is absolutely no visible rectangle.
      const radius = Math.sqrt(r2);
      const centerClear = THREE.MathUtils.smoothstep(radius, 0.17, 0.43);
      const a = Math.max(0, Math.exp(-r2 * 3.4) - Math.exp(-3.4)) * centerClear;
      const i = 4 * (y * n + x);
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(255 * Math.min(1, a * 1.32));
    }
  }
  const texture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat);
  texture.name = "SNOW360_V77_SnowboardCrystalStyleHalo";
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const SHELL_VERTEX = [
  "uniform float uExpansion;",
  "varying vec3 vNormalV;",
  "varying vec3 vViewPosition;",
  "void main() {",
  "  vec3 expanded = position + normalize(normal) * uExpansion;",
  "  vec4 viewPos = modelViewMatrix * vec4(expanded,1.0);",
  "  vNormalV = normalize(normalMatrix*normal);",
  "  vViewPosition = viewPos.xyz;",
  "  gl_Position = projectionMatrix * viewPos;",
  "}",
].join("\n");

const SHELL_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uOpacity;",
  "varying vec3 vNormalV;",
  "varying vec3 vViewPosition;",
  "void main() {",
  "  vec3 n = normalize(vNormalV);",
  "  vec3 v = normalize(-vViewPosition);",
  "  float edge = pow(1.0-clamp(abs(dot(n,v)),0.0,1.0),1.2);",
  "  float sweep = 0.5+0.5*sin(uTime*1.0+vViewPosition.x*2.7);",
  "  vec3 cyan = vec3(.47,.93,1.0);",
  "  vec3 pink = vec3(1.0,.64,.90);",
  "  vec3 col = mix(cyan,pink,sweep);",
  "  float a = uOpacity * (0.26+0.74*edge);",
  "  gl_FragColor = vec4(col,a);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

function useOutlineMaterial(expansion, opacity, name) {
  return useMemo(() => new THREE.ShaderMaterial({
    name,
    uniforms: {
      uExpansion: { value: expansion },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  }), [expansion, opacity, name]);
}

function useDeckClone(asset, material) {
  return useMemo(() => {
    if (!asset?.scene) return null;
    const cloned = asset.scene.clone(true);
    let decks = 0;
    cloned.traverse(node => {
      if (!node.isMesh) return;
      const isDeck = DECK_NAME.test(node.name || "");
      node.visible = isDeck;
      if (isDeck) {
        ++decks;
        node.material = material;
        node.frustumCulled = false;
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    return decks ? cloned : null;
  }, [asset, material]);
}

function GlowHalo({ mobile = false }) {
  const tex = useMemo(createHaloTexture, []);
  const cyanRef = useRef();
  const pinkRef = useRef();
  const pearlRef = useRef();

  const materials = useMemo(() => ([
    new THREE.SpriteMaterial({
      name: "SNOW360_V77_Snowboard_CyanCrystalAura",
      map: tex,
      color: "#5addff",
      transparent: true,
      opacity: mobile ? 0.30 : 0.44,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
    new THREE.SpriteMaterial({
      name: "SNOW360_V77_Snowboard_PinkCrystalAura",
      map: tex,
      color: "#ff91eb",
      transparent: true,
      opacity: mobile ? 0.28 : 0.41,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
    new THREE.SpriteMaterial({
      name: "SNOW360_V77_Snowboard_PearlCrystalAura",
      map: tex,
      color: "#faffff",
      transparent: true,
      opacity: mobile ? 0.09 : 0.13,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  ]), [tex, mobile]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const wave = Math.sin(t * 1.45);
    materials[0].opacity = (mobile ? 0.30 : 0.44) * (0.92 + 0.08 * wave);
    materials[1].opacity = (mobile ? 0.28 : 0.41) * (0.92 - 0.08 * wave);
    materials[2].opacity = (mobile ? 0.09 : 0.13) * (0.93 + 0.07 * Math.sin(t * 2.0 + 1.3));
    if (cyanRef.current) {
      const s = 1.24 * (1 + 0.035 * Math.sin(t * 1.3));
      cyanRef.current.scale.set(s, s, 1);
    }
    if (pinkRef.current) {
      const s = 1.24 * (1 + 0.035 * Math.sin(t * 1.3 + 2));
      pinkRef.current.scale.set(s, s, 1);
    }
  });

  useEffect(() => () => {
    materials.forEach(mat => mat.dispose());
    tex.dispose();
  }, [materials, tex]);

  return (
    // Three soft sprite halos travel with the actual board and its tricks.
    // Their separate positions along the board create a soft pill-shaped
    // light silhouette even at the camera's shallow snowboarding angle.
    <group name="SNOW360_V77_VisibleCrystalStyleSnowboardGlow">
      <sprite ref={cyanRef} material={materials[0]}
        position={[0, 0.13, -0.69]}
        scale={[1.24, 1.24, 1]} renderOrder={2}
      />
      <sprite ref={pinkRef} material={materials[1]}
        position={[0, 0.13, 0.69]}
        scale={[1.24, 1.24, 1]} renderOrder={2}
      />
      <sprite ref={pearlRef} material={materials[2]}
        position={[0, 0.13, 0]}
        scale={[1.06, 1.06, 1]} renderOrder={2}
      />
    </group>
  );
}

export default function Snow64SnowboardGlow({
  asset = null,
  fallbackGeometry = null,
  mobile = false,
}) {
  const width = asset?.size?.[0] || .255;
  const innerMat = useOutlineMaterial(
    asset ? width * 0.085 : 0.05,
    mobile ? .28 : .36,
    "SNOW360_V77_BoardMeshEdgeHighlight"
  );
  const outerMat = useOutlineMaterial(
    asset ? width * 0.15 : .10,
    mobile ? .11 : .15,
    "SNOW360_V77_BoardMeshOuterHighlight"
  );
  const inner = useDeckClone(asset, innerMat);
  const outer = useDeckClone(asset, outerMat);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    innerMat.uniforms.uTime.value = t;
    outerMat.uniforms.uTime.value = t;
  });

  useEffect(() => () => {
    innerMat.dispose();
    outerMat.dispose();
  }, [innerMat, outerMat]);

  if (asset && inner && outer) {
    const fit = [0.74, 0.25, 2.43].map((v, i) =>
      v * (SNOW64_MODEL_SCALE.snowboard?.[i] || 1) /
      Math.max(.0001, asset.size[i])
    );
    return (
      <group name="SNOW360_V77_GLBBoardGlow" position={SNOW64_SNOWBOARD_FOOT_TUNE}>
        <GlowHalo mobile={mobile}/>
        <group scale={fit}>
          <group position={[-asset.centerX, -asset.bottom, -asset.centerZ]}>
            <primitive object={inner} dispose={null}/>
            <primitive object={outer} dispose={null}/>
          </group>
        </group>
      </group>
    );
  }

  if (fallbackGeometry) {
    return (
      <group>
        <GlowHalo mobile={mobile}/>
        <mesh geometry={fallbackGeometry} material={innerMat}
          position={[0,.065,0]} castShadow={false} receiveShadow={false}
          frustumCulled={false}/>
        <mesh geometry={fallbackGeometry} material={outerMat}
          position={[0,.065,0]} castShadow={false} receiveShadow={false}
          frustumCulled={false}/>
      </group>
    );
  }
  return null;
}
