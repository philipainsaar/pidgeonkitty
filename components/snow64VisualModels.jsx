"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { SNOW64_MODEL_PATHS, SNOW64_MODEL_SCALE, SNOW64_MODEL_POSITION_OFFSET } from "./snow64ModelConfig";

const Context = createContext({});
const FALLBACK_SIZE = 0.0001;

/** Pure GLB analysis: establishes a common origin at the bottom, center X/Z. */
export function describeSnowModel(gltf) {
  if (!gltf?.scene) return null;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) return null;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);
  // The tree/obstacle fields use GPU instancing: models must have static meshes.
  const meshes = [];
  const inverseRoot = scene.matrixWorld.clone().invert();
  scene.traverse((obj) => {
    if (!obj.isMesh || obj.isSkinnedMesh || !obj.geometry || !obj.material) return;
    meshes.push({
      geometry: obj.geometry,
      material: obj.material,
      local: inverseRoot.clone().multiply(obj.matrixWorld),
    });
  });
  if (!meshes.length) return null;
  return {
    scene,
    meshes,
    centerX: center.x,
    centerZ: center.z,
    bottom: bounds.min.y,
    size: [Math.max(FALLBACK_SIZE, size.x), Math.max(FALLBACK_SIZE, size.y), Math.max(FALLBACK_SIZE, size.z)],
  };
}

/** Failure is nonfatal: any missing GLB simply keeps the default scenery. */
export function Snow64ModelProvider({children}) {
  const [models, setModels] = useState({});
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    for (const [name, path] of Object.entries(SNOW64_MODEL_PATHS)) {
      // The animated rider is managed by useGLTF, not this static prop loader.
      if (!path || name === "riderDesktop" || name === "riderMobile") continue;
      loader.load(path, gltf => {
        const model = describeSnowModel(gltf);
        if (model && !cancelled) setModels(prev => ({...prev, [name]: model}));
      }, undefined, () => { /* Optional file not found: use built-in model. */ });
    }
    return () => { cancelled = true; };
  }, []);
  return <Context.Provider value={models}>{children}</Context.Provider>;
}

export function useSnowModel(name) { return useContext(Context)[name] || null; }

function scaleFor(name, model, dimensions) {
  const multiply = SNOW64_MODEL_SCALE[name] || [1,1,1];
  return dimensions.map((v,i) => v * multiply[i] / model.size[i]);
}

/** A single GLB (snowboard, mushroom, ramp, banner, rock, token).
 * Its visual bounds auto-fit the same space occupied by the original mesh.
 */
export function SnowGLBVisual({asset, type, dimensions}) {
  const clone = useMemo(() => asset?.scene.clone(true), [asset]);
  if (!asset || !clone) return null;
  const scales = scaleFor(type, asset, dimensions);
  // Apply visual-only offsets AFTER scale, so the value is always in
  // world/game units regardless of the GLB's original export dimensions.
  // All other model types default to the original centered placement.
  const offset = SNOW64_MODEL_POSITION_OFFSET[type] || [0, 0, 0];
  return <group position={offset} scale={scales}>
    <group position={[-asset.centerX,-asset.bottom,-asset.centerZ]}>
      <primitive object={clone} dispose={null}/>
    </group>
  </group>;
}

/** Draw all the GLB trees (or other static repeated props) in a few GPU draws.
 * The original per-item collision IDs and world positions are unchanged.
 * Each GLB mesh is instanced, so an authored multi-part tree remains efficient.
 */
export function SnowGLBInstances({asset, type, items, pose, hidden, animated=false}) {
  const refs = useRef([]);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const hiddenRefRef = useRef(hidden);
  hiddenRefRef.current = hidden;
  const scratch = useMemo(() => ({
    position: new THREE.Vector3(), rotation: new THREE.Euler(), quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(), base: new THREE.Matrix4(), fit: new THREE.Matrix4(), mat: new THREE.Matrix4(),
    origin: new THREE.Matrix4().makeTranslation(-asset.centerX,-asset.bottom,-asset.centerZ),
  }), [asset]);
  const update = (t) => {
    for (let j=0; j<asset.meshes.length; j++) {
      const mesh = refs.current[j];
      if (!mesh) continue;
      for (let i=0; i<items.length; i++) {
        const obj = items[i];
        const isHidden = !!hiddenRefRef.current?.(obj);
        const p = poseRef.current(obj,i,t);
        scratch.position.set(...p.position);
        scratch.rotation.set(...(p.rotation || [0,0,0]));
        scratch.quaternion.setFromEuler(scratch.rotation);
        if (isHidden) scratch.scale.setScalar(.000001);
        else scratch.scale.set(...scaleFor(type,asset,p.dimensions));
        scratch.base.compose(scratch.position,scratch.quaternion,scratch.scale);
        scratch.mat.copy(scratch.base).multiply(scratch.origin).multiply(asset.meshes[j].local);
        mesh.setMatrixAt(i,scratch.mat);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  useEffect(() => { update(0); }, [asset,items,scratch]);
  useFrame(({clock}) => { if (animated || hidden) update(clock.elapsedTime); });
  return <group>
    {asset.meshes.map((part,i)=><instancedMesh key={i} ref={v=>{refs.current[i]=v;}}
      args={[part.geometry,part.material,items.length]} frustumCulled={false} dispose={null}/>) }
  </group>;
}
