"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import Snow64StartCastle from "./Snow64StartCastle";
import { SNOW64_MODEL_PATHS, SNOW64_MODEL_SCALE, SNOW64_SNOWBOARD_FOOT_TUNE } from "./snow64ModelConfig";

const Context = createContext({});
const FALLBACK_SIZE = 0.0001;
// Bury the widened root base beneath the snow, so the tree grows naturally
// out of the ground rather than displaying an exposed platform at its foot.
// Adjust this fraction (0.00 to 0.15 is a useful range) if desired.
const TREE_ROOT_BURY_FRACTION = 0.10;

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

// Welcome and gameplay share immutable geometry/materials. Cache the pending
// load as well as the result so two mounted scenes do not decode each GLB twice.
const staticModelLoads = new Map();
function loadStaticModel(path) {
  if (!staticModelLoads.has(path)) {
    const pending = new GLTFLoader().loadAsync(path).then(describeSnowModel).catch(() => {
      staticModelLoads.delete(path); return null;
    });
    staticModelLoads.set(path, pending);
  }
  return staticModelLoads.get(path);
}

/** Failure is nonfatal: any missing GLB simply keeps the default scenery. */
export function Snow64ModelProvider({children}) {
  const [models, setModels] = useState({});
  useEffect(() => {
    let cancelled = false;
    for (const [name, path] of Object.entries(SNOW64_MODEL_PATHS)) {
      // The animated rider is managed by useGLTF, not this static prop loader.
      if (!path || name === "riderDesktop" || name === "riderMobile") continue;
      loadStaticModel(path).then(model => {
        if (model && !cancelled) setModels(prev => ({...prev, [name]: model}));
      });
    }
    return () => { cancelled = true; };
  }, []);
  // The same permanent castle exists in the real gameplay world and the
  // preloaded intro world. It never follows the rider or affects collisions.
  return <Context.Provider value={models}>
    {children}
    <Snow64StartCastle />
  </Context.Provider>;
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
  // Keep the common auto-fit origin. Apply only a *small* configurable visual
  // translation outside the scale group, in world/game units. Never shift the
  // rider, board physics, or procedural snowboard geometry.
  const visualOffset = type === "snowboard" ? SNOW64_SNOWBOARD_FOOT_TUNE : [0, 0, 0];
  return <group position={visualOffset}>
    <group scale={scales}>
      <group position={[-asset.centerX,-asset.bottom,-asset.centerZ]}>
        <primitive object={clone} dispose={null}/>
      </group>
    </group>
  </group>;
}

/** Stable, world-position-based variation for trees.
 * Each tree has a different yaw/lean/size, but its shape never jitters as the
 * camera moves or endless course chunks recycle. Does not affect physics.
 */
function treeHash(tree, index, salt) {
  const x = Math.round((tree.x ?? 0) * 137);
  const z = Math.round((tree.z ?? 0) * 137);
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263)
        ^ Math.imul(index + 1, 2246822519) ^ Math.imul(salt + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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
  // Different tree headings + very subtle individual lean and size. The forest
  // remains efficiently GPU-instanced, even on mobile.
  const treeVariation = useMemo(() => type !== "tree" ? null : items.map((tree, i) => ({
    yaw: (treeHash(tree, i, 0) - 0.5) * 1.2,
    leanX: (treeHash(tree, i, 1) - 0.5) * 0.075,
    leanZ: (treeHash(tree, i, 2) - 0.5) * 0.075,
    size: 0.95 + treeHash(tree, i, 3) * 0.10,
  })), [items, type]);
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
        // The GLB is normally snapped to its lowest point. For this cloud tree
        // that leaves the wide roots exposed on top of the snow. Sink only the
        // tree visual, proportionally to its fitted height, under the terrain.
        // Physics positions and other models stay unchanged.
        if (type === "tree") scratch.position.y -= p.dimensions[1] * TREE_ROOT_BURY_FRACTION;
        const originalRotation = p.rotation || [0,0,0];
        const variety = treeVariation?.[i];
        scratch.rotation.set(
          originalRotation[0] + (variety?.leanX || 0),
          originalRotation[1] + (variety?.yaw || 0),
          originalRotation[2] + (variety?.leanZ || 0),
        );
        scratch.quaternion.setFromEuler(scratch.rotation);
        if (isHidden) scratch.scale.setScalar(.000001);
        else {
          scratch.scale.set(...scaleFor(type,asset,p.dimensions));
          if (variety) scratch.scale.multiplyScalar(variety.size);
        }
        scratch.base.compose(scratch.position,scratch.quaternion,scratch.scale);
        scratch.mat.copy(scratch.base).multiply(scratch.origin).multiply(asset.meshes[j].local);
        mesh.setMatrixAt(i,scratch.mat);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  useEffect(() => { update(0); }, [asset,items,scratch,treeVariation]);
  useFrame(({clock}) => { if (animated || hidden) update(clock.elapsedTime); });
  return <group>
    {asset.meshes.map((part,i)=><instancedMesh key={i} ref={v=>{refs.current[i]=v;}}
      args={[part.geometry,part.material,items.length]} frustumCulled={false} dispose={null}/>) }
  </group>;
}
