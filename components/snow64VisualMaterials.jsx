"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SNOW64_TEXTURE_PATHS } from "./snow64Appearance";

const TextureContext = createContext({textures:{},material:null});

/**
 * The V63 world-space snow material layout with a bright white fleece finish.
 * Snow is deliberately unlit so the game's high-key arcade lighting cannot
 * turn pearl-white fabric gray or wash out its subtle soft fibers.
 * Puffs have soft geometry-derived color shading in Snow64CloudLayer.jsx.
 */
export function Snow64TextureProvider({children,mobile=false}) {
  const [textures,setTextures]=useState({});
  useEffect(()=>{
    let alive=true;
    const loaded=[];
    const loader=new THREE.TextureLoader();
    for(const [kind,path] of Object.entries(SNOW64_TEXTURE_PATHS)){
      if(!path)continue;
      loader.load(path,texture=>{
        if(!alive){texture.dispose();return;}
        const isNormal=kind==="snowNormal"||kind==="bankNormal";
        texture.colorSpace=isNormal?THREE.NoColorSpace:THREE.SRGBColorSpace;
        if(["snowGround","snowBanks","snowNormal","bankNormal","snowPile"].includes(kind)){
          texture.wrapS=THREE.RepeatWrapping;
          texture.wrapT=THREE.RepeatWrapping;
          texture.anisotropy=mobile?2:4;
        }
        texture.needsUpdate=true;
        loaded.push(texture);
        setTextures(old=>({...old,[kind]:texture}));
      },undefined,()=>{});
    }
    return()=>{alive=false;loaded.forEach(t=>t.dispose());};
  },[mobile]);

  const snow=textures.snowGround || null;
  const pile=textures.snowPile || null;
  const material=useMemo(()=>{
    const m=new THREE.MeshBasicMaterial({
      map:snow, color:"#fffefd", vertexColors:true,
      side:THREE.DoubleSide, toneMapped:false, fog:true
    });
    if(snow&&pile){
      m.onBeforeCompile=shader=>{
        shader.uniforms.uSnowPile={value:pile};
        shader.vertexShader="varying vec2 vSnowWorldXZ;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n vSnowWorldXZ = position.xz;"
        );
        shader.fragmentShader=
          "uniform sampler2D uSnowPile;\nvarying vec2 vSnowWorldXZ;\n"+
          shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n"+
          "float plushBank = smoothstep(10.2, 19.0, abs(vSnowWorldXZ.x));\n"+
          "float finePile = texture2D(uSnowPile, vec2(vSnowWorldXZ.x,-vSnowWorldXZ.y)/0.90).r;\n"+
          "diffuseColor.rgb *= mix(0.992,0.972+0.053*finePile,plushBank);\n"
        );
      };
      m.customProgramCacheKey=()=>"snow360-white-plush-v67";
    }
    return m;
  },[snow,pile]);
  useEffect(()=>()=>material.dispose(),[material]);
  const shared=useMemo(()=>({textures,material}),[textures,material]);
  return <TextureContext.Provider value={shared}>{children}</TextureContext.Provider>;
}

export function useSnow64Texture(kind){
  return useContext(TextureContext).textures[kind]??null;
}
export function useSnow64TerrainMaterials(){
  return useContext(TextureContext).material;
}
