"use client";

import { useEffect, useMemo, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { snow360Drift } from "./snow64SnowDrifts";

/**
 * SNOW360 V5: an OPTIONAL, persistent start-point castle.
 *
 * Drop public/models/snow360-start-castle.glb into the project and refresh.
 * The same world-space castle is rendered in BOTH the intro Canvas and the
 * original game Canvas, as the providers share this simple scenery component.
 * Missing files fail quietly, and no collision or physics changes are made.
 */
export const START_CASTLE = Object.freeze({
  url: "/models/snow360-start-castle.glb",
  x: 0,
  z: 23,               // Uphill, physically behind the starting character.
  extraHeight: 0,      // Raise for castles with a buried plinth or foundation.
  maximumWidth: 12,
  maximumHeight: 12.5,
  maximumDepth: 9.5,
  heading: 0,          // In Blender, castle entrance should face -Z.
});

let cachedModel = null;
let pendingModel = null;
function loadCastleOnce() {
  if (cachedModel) return Promise.resolve(cachedModel);
  if (!pendingModel) {
    pendingModel = new Promise(resolve => {
      const loader = new GLTFLoader();
      loader.load(START_CASTLE.url, gltf => {
        const scene = gltf?.scene;
        if (!scene) { resolve(null); return; }
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        if (bounds.isEmpty()) { resolve(null); return; }
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = Math.min(
          START_CASTLE.maximumWidth / Math.max(size.x, 0.0001),
          START_CASTLE.maximumHeight / Math.max(size.y, 0.0001),
          START_CASTLE.maximumDepth / Math.max(size.z, 0.0001),
        );
        cachedModel = {scene,center,bottom:bounds.min.y,scale};
        resolve(cachedModel);
      }, undefined, () => resolve(null));
    });
  }
  return pendingModel;
}

export default function Snow64StartCastle() {
  const [asset, setAsset] = useState(() => cachedModel);
  useEffect(() => {
    let live = true;
    loadCastleOnce().then(model => { if (live && model) setAsset(model); });
    return () => { live = false; };
  }, []);
  const clone = useMemo(() => asset?.scene.clone(true), [asset]);
  const ground = useMemo(() => {
    const {x,z} = START_CASTLE;
    const bank = Math.max(0, Math.abs(x) - 12);
    return 0.077*z + 0.5*Math.sin(-z*0.04)
      + 0.31*Math.sin(x*0.22 - z*0.018)
      + bank*bank*0.055 + snow360Drift(x,z) + START_CASTLE.extraHeight;
  }, []);
  if (!clone || !asset) return null;
  return (
    <group position={[START_CASTLE.x, ground, START_CASTLE.z]}
      rotation={[0, START_CASTLE.heading, 0]}>
      <group scale={asset.scale}>
        <group position={[-asset.center.x, -asset.bottom, -asset.center.z]}>
          <primitive object={clone} dispose={null}/>
        </group>
      </group>
    </group>
  );
}
