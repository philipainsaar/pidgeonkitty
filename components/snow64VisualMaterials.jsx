"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SNOW64_TEXTURE_PATHS } from "./snow64Appearance";

const TextureContext = createContext({textures:{},material:null});

/**
 * SNOW360 V73: 2-3x stronger center-lane pastel thin-film shader.
 * The existing texture is untouched and the extra effect is masked by
 * WORLD-space X, so it never breaks the course or sidebank seams.
 */
const SNOW_HOLOGRAPHIC_FILM = [
  "vec3 p = vSnowWorldPosition;",
  "float t = uSnowFilmTime;",
  "float lane = 1.0 - smoothstep(8.7,17.3,abs(p.x));",
  "vec3 n = normalize(vSnowNormalWorld);",
  "vec3 viewDir = normalize(cameraPosition-p);",
  "float fresnel = pow(1.0-clamp(abs(dot(n,viewDir)),0.0,1.0),2.15);",
  "float phaseA = sin(1.55*(p.x*0.46+p.z*0.34)+t*0.72);",
  "float phaseB = sin(1.55*(p.z*0.72-p.x*0.37)-t*0.52);",
  "float interference = clamp(0.52+0.34*phaseA+0.18*phaseB,0.0,1.0);",
  "float cycle = 0.5+0.5*sin(t*0.45+p.z*0.055);",
  "float hue = 0.5+0.5*sin(t*0.33-p.x*0.21+p.z*0.10);",
  "vec3 cyan = vec3(0.60,0.90,1.00);",
  "vec3 lavender = vec3(0.84,0.70,1.00);",
  "vec3 pink = vec3(1.00,0.72,0.88);",
  "vec3 yellow = vec3(1.00,0.94,0.68);",
  "vec3 mint = vec3(0.70,1.00,0.90);",
  "vec3 film = mix(cyan,lavender,interference);",
  "film = mix(film,pink,cycle*0.62);",
  "film = mix(film,mix(yellow,mint,hue),0.20);",
  "float sweep = exp(-pow(sin(p.x*0.39+p.z*0.055-t*0.55)/0.16,2.0));",
  "float filmWeight = lane*(0.55+0.30*fresnel+0.15*sweep);",
  "filmWeight=clamp(filmWeight,0.0,0.86);",
  "diffuseColor.rgb=mix(diffuseColor.rgb,film,filmWeight);",
  "diffuseColor.rgb+=vec3(0.032,0.030,0.045)*lane*sweep;"
].join("\n");

/**
 * The V63 world-space snow material layout with a bright white fleece finish.
 * Snow is deliberately unlit so the game's high-key arcade lighting cannot
 * turn pearl-white fabric gray or wash out its subtle soft fibers.
 * Puffs have soft geometry-derived color shading in Snow64CloudLayer.jsx.
 */
export function Snow64TextureProvider({children,mobile=false}) {
  const [textures,setTextures]=useState({});
  const filmShader=useRef(null);
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
        shader.uniforms.uSnowFilmTime={value:0};
        filmShader.current=shader;
        shader.vertexShader="varying vec2 vSnowWorldXZ;\nvarying vec3 vSnowWorldPosition;\nvarying vec3 vSnowNormalWorld;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n vSnowWorldXZ = position.xz;\n vSnowWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;\n vSnowNormalWorld=normalize(mat3(modelMatrix)*normal);"
        );
        shader.fragmentShader=
          "uniform sampler2D uSnowPile;\nuniform float uSnowFilmTime;\nvarying vec2 vSnowWorldXZ;\nvarying vec3 vSnowWorldPosition;\nvarying vec3 vSnowNormalWorld;\n"+
          shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n"+
          "float plushBank = smoothstep(10.2, 19.0, abs(vSnowWorldXZ.x));\n"+
          "float finePile = texture2D(uSnowPile, vec2(vSnowWorldXZ.x,-vSnowWorldXZ.y)/0.90).r;\n"+
          "diffuseColor.rgb *= mix(0.992,0.972+0.053*finePile,plushBank);\n" + SNOW_HOLOGRAPHIC_FILM
        );
      };
      m.customProgramCacheKey=()=>"snow360-v73-strong-holographic-film";
    }
    return m;
  },[snow,pile]);
  useFrame(({clock})=>{
    if(filmShader.current?.uniforms?.uSnowFilmTime){
      filmShader.current.uniforms.uSnowFilmTime.value=clock.elapsedTime;
    }
  });
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
