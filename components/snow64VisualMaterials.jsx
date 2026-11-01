"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SNOW64_TEXTURE_PATHS, SNOW64_TERRAIN } from "./snow64Appearance";

const TextureContext = createContext({textures:{},materials:[]});

/** Load each optional texture once and keep the terrain materials shared
 * across all endless-course chunks. Missing files keep procedural fallbacks.
 */
export function Snow64TextureProvider({children, mobile=false}) {
  const [textures, setTextures] = useState({});
  useEffect(() => {
    let alive = true;
    const loaded=[];
    const loader = new THREE.TextureLoader();
    for(const [kind,path] of Object.entries(SNOW64_TEXTURE_PATHS)) {
      if(!path) continue;
      loader.load(path, texture => {
        if(!alive){texture.dispose();return;}
        texture.colorSpace = kind === "snowNormal" || kind === "bankNormal"
          ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        if(kind === "snowGround" || kind === "snowBanks" || kind === "snowNormal" || kind === "bankNormal") {
          texture.wrapS=THREE.RepeatWrapping;
          texture.wrapT=THREE.RepeatWrapping;
          texture.anisotropy=mobile?2:4;
        }
        texture.needsUpdate=true;
        loaded.push(texture);
        setTextures(previous=>({...previous,[kind]:texture}));
      }, undefined, () => { /* Optional texture not present; use original art */ });
    }
    return () => {
      alive=false;
      loaded.forEach(texture=>texture.dispose());
    };
  }, [mobile]);

  const snow=textures.snowGround||null;
  const banks=textures.snowBanks||null;
  const normal=textures.snowNormal||null;
  const bankNormal=textures.bankNormal||null;
  const materials=useMemo(()=> {
    const bankTexture=banks || (SNOW64_TERRAIN.useGroundTextureOnBanksWhenMissing?snow:null);
    // Keep the original Lambert shader when nothing custom is provided.
    const makeMaterial=(map,normalMap)=>{
      if(!map && !normalMap)return new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
      const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,
        roughness:SNOW64_TERRAIN.roughness,map,normalMap});
      material.normalScale.setScalar(SNOW64_TERRAIN.normalStrength);
      return material;
    };
    return [makeMaterial(snow,normal),makeMaterial(bankTexture,bankNormal||normal)];
  },[snow,banks,normal,bankNormal]);
  useEffect(()=>()=>materials.forEach(m=>m.dispose()),[materials]);
  const shared=useMemo(()=>({textures,materials}),[textures,materials]);
  return <TextureContext.Provider value={shared}>{children}</TextureContext.Provider>;
}

export function useSnow64Texture(kind) { return useContext(TextureContext).textures[kind]??null; }
export function useSnow64TerrainMaterials() { return useContext(TextureContext).materials; }
