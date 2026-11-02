"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SNOW64_TEXTURE_PATHS, SNOW64_TERRAIN } from "./snow64Appearance";

const TextureContext = createContext({textures:{},material:null});

/**
 * Shared, world-anchored cotton-candy snow for all endless terrain chunks.
 *
 * One base/normal texture spans the center and both banks, so their boundary
 * cannot reveal a material seam. A high-frequency pile detail map appears
 * gradually toward the tree banks, never across a hard material split.
 */
export function Snow64TextureProvider({children, mobile=false}) {
  const [textures, setTextures] = useState({});
  useEffect(() => {
    let alive = true;
    const loaded = [];
    const loader = new THREE.TextureLoader();
    for (const [kind, path] of Object.entries(SNOW64_TEXTURE_PATHS)) {
      if (!path) continue;
      loader.load(path, texture => {
        if (!alive) { texture.dispose(); return; }
        const normal = kind === "snowNormal" || kind === "bankNormal";
        texture.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        if (["snowGround","snowBanks","snowNormal","bankNormal","snowPile"].includes(kind)) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = mobile ? 2 : 4;
        }
        texture.needsUpdate = true;
        loaded.push(texture);
        setTextures(previous => ({...previous,[kind]:texture}));
      }, undefined, () => { /* Optional texture: graceful fallbacks. */ });
    }
    return () => {
      alive = false;
      loaded.forEach(texture => texture.dispose());
    };
  }, [mobile]);

  const snow = textures.snowGround || null;
  const normal = textures.snowNormal || null;
  const pile = textures.snowPile || null;
  const material = useMemo(() => {
    const m = !snow && !normal
      ? new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide})
      : new THREE.MeshStandardMaterial({
          vertexColors:true,side:THREE.DoubleSide,
          map:snow,normalMap:normal,roughness:SNOW64_TERRAIN.roughness,
          metalness:0,
        });
    if (normal && m.normalScale) {
      m.normalScale.setScalar(SNOW64_TERRAIN.normalStrength);
    }
    if (pile) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uCottonPile = {value:pile};
        shader.vertexShader = "varying vec2 vCottonWorldXZ;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  vCottonWorldXZ = position.xz;"
        );
        shader.fragmentShader =
          "uniform sampler2D uCottonPile;\nvarying vec2 vCottonWorldXZ;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          // Scaled world-space detail blends across the lane-to-bank boundary.
          // Soft granular fleece gets denser toward the tree-covered sidewalls.
          float cottonBank = smoothstep(10.5, 19.0, abs(vCottonWorldXZ.x));
          float cottonPile = texture2D(uCottonPile,
            vec2(vCottonWorldXZ.x, -vCottonWorldXZ.y) / 1.05).r;
          diffuseColor.rgb *= mix(1.0, 0.935 + 0.125 * cottonPile,
            cottonBank);`
        );
      };
      m.customProgramCacheKey = () => "snow360-cotton-pile-v59";
    }
    return m;
  }, [snow,normal,pile]);
  useEffect(() => () => material.dispose(), [material]);
  const shared = useMemo(() => ({textures,material}), [textures,material]);
  return <TextureContext.Provider value={shared}>{children}</TextureContext.Provider>;
}

export function useSnow64Texture(kind) {
  return useContext(TextureContext).textures[kind] ?? null;
}
export function useSnow64TerrainMaterials() {
  return useContext(TextureContext).material;
}
