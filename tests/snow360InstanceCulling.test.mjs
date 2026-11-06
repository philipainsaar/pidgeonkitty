import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { createSnowDynamicCuller, registerSnowCulling } from "../components/snow360InstanceCulling.js";

test("camera culling retains exact transforms and restores instances when looking back", () => {
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
  const positions = [[0,0,-10],[100,0,-10],[0,0,10]];
  positions.forEach((p,i) => mesh.setMatrixAt(i,new Matrix4().makeTranslation(...p)));
  mesh.computeBoundingSphere();
  const restore = () => positions.forEach((p,i) => mesh.setMatrixAt(i,new Matrix4().makeTranslation(...p)));
  const runCull = createSnowDynamicCuller(mesh,3); const cull = (camera,enabled=true) => { restore(); runCull(camera,enabled); };
  const camera = new PerspectiveCamera(60,1,.1,200);
  camera.updateMatrixWorld();
  cull(camera);
  assert.equal(mesh.count,1);
  const result = new Matrix4(); mesh.getMatrixAt(0,result);
  assert.deepEqual(result.elements,new Matrix4().makeTranslation(...positions[0]).elements);
  cull(camera,false); assert.equal(mesh.count,3);
  positions.forEach((p,i) => { mesh.getMatrixAt(i,result); assert.deepEqual(result.elements,new Matrix4().makeTranslation(...p).elements); });
  camera.rotation.y = Math.PI; camera.updateMatrixWorld(); cull(camera);
  assert.equal(mesh.count,1); mesh.getMatrixAt(0,result);
  assert.deepEqual(result.elements,new Matrix4().makeTranslation(...positions[2]).elements);
  camera.rotation.y = 0; camera.updateMatrixWorld(); cull(camera);
  mesh.getMatrixAt(0,result);
  assert.deepEqual(result.elements,new Matrix4().makeTranslation(...positions[0]).elements);
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});

test("scene culling callbacks preserve existing hooks and clean up independently", () => {
  const scene = new Scene(), calls = [];
  const original = () => calls.push("original"); scene.onBeforeRender=original;
  const removeA=registerSnowCulling(scene,()=>calls.push("a"));
  const removeB=registerSnowCulling(scene,()=>calls.push("b"));
  scene.onBeforeRender(null,scene,new PerspectiveCamera());
  assert.deepEqual(calls,["original","a","b"]);
  removeA(); calls.length=0; scene.onBeforeRender(null,scene,new PerspectiveCamera());
  assert.deepEqual(calls,["original","b"]);
  removeB(); assert.equal(scene.onBeforeRender,original);
});


test("compaction keeps colors attached and excludes hidden instances", () => {
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
  mesh.setMatrixAt(0,new Matrix4().makeTranslation(100,0,-10));
  mesh.setMatrixAt(1,new Matrix4().makeTranslation(0,0,-10));
  mesh.setMatrixAt(2,new Matrix4().makeScale(.000001,.000001,.000001));
  mesh.setColorAt(0,new Color(1,0,0)); mesh.setColorAt(1,new Color(0,1,0));
  mesh.setColorAt(2,new Color(0,0,1));
  const camera=new PerspectiveCamera(60,1,.1,200); camera.updateMatrixWorld();
  createSnowDynamicCuller(mesh,3)(camera);
  assert.equal(mesh.count,1);
  const color=new Color(); mesh.getColorAt(0,color);
  assert.deepEqual(color.toArray(),[0,1,0]);
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});
