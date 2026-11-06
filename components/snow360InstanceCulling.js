import { Color, Frustum, Matrix4, Sphere } from "three";

// For fields that rewrite all source slots in useFrame before each render.
export function createSnowDynamicCuller(mesh, capacity, padding = 0) {
  mesh.geometry.computeBoundingSphere();
  const base = mesh.geometry.boundingSphere.clone(); base.radius += padding;
  const frustum = new Frustum(), projection = new Matrix4(), matrix = new Matrix4(), sphere = new Sphere(), color = new Color();
  return (camera, enabled = true) => {
    if (!enabled) { mesh.count=capacity; return; }
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection,camera.coordinateSystem);
    let count=0;
    for (let i=0;i<capacity;i++) {
      mesh.getMatrixAt(i,matrix);
      sphere.copy(base).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld);
      if (sphere.radius < .00001 || !frustum.intersectsSphere(sphere)) continue;
      if (count !== i) {
        mesh.setMatrixAt(count,matrix);
        if (mesh.instanceColor) { mesh.getColorAt(i,color); mesh.setColorAt(count,color); }
      }
      count++;
    }
    mesh.count=count;
    mesh.instanceMatrix.needsUpdate=true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  };
}

const scenes = new WeakMap();
export function registerSnowCulling(scene, callback) {
  let entry = scenes.get(scene);
  if (!entry) {
    const original = scene.onBeforeRender;
    entry = { original, callbacks:new Set() };
    entry.wrapper = function(renderer, activeScene, camera, ...rest) {
      original.call(this, renderer, activeScene, camera, ...rest);
      for (const cb of entry.callbacks) cb(camera);
    };
    scene.onBeforeRender = entry.wrapper;
    scenes.set(scene,entry);
  }
  entry.callbacks.add(callback);
  return () => {
    entry.callbacks.delete(callback);
    if (!entry.callbacks.size) {
      if (scene.onBeforeRender === entry.wrapper) scene.onBeforeRender = entry.original;
      scenes.delete(scene);
    }
  };
}


