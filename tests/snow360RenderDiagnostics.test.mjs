import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { createRenderDiagnostics, diagnosticWindow } from '../components/snow360RenderDiagnostics.js';
test('diagnostic schedule interleaves baseline and excludes transition frames',()=>{
 assert.deepEqual(diagnosticWindow(0),{variant:'baseline',settled:false});
 assert.deepEqual(diagnosticWindow(3500),{variant:'no-star-glow',settled:true});
 assert.equal(diagnosticWindow(6000).variant,'baseline');
 assert.equal(diagnosticWindow(21500).variant,'unlit-materials');
 assert.equal(diagnosticWindow(24000).variant,'baseline');
});
test('diagnostic render changes restore visibility and exact material identities',()=>{
 const scene=new Scene(), trees=new Group(); trees.name='Snow360Trees'; scene.add(trees);
 const mat=new MeshStandardMaterial({color:0x55aa22});
 const mesh=new Mesh(new BoxGeometry(),mat); mesh.name='Snow360StarGlow'; scene.add(mesh);
 const experiment=createRenderDiagnostics();
 let restore=experiment.apply(scene,'baseline'); assert.equal(mesh.material,mat); assert.equal(trees.visible,true); restore();
 restore=experiment.apply(scene,'no-trees'); assert.equal(trees.visible,false); restore(); assert.equal(trees.visible,true);
 restore=experiment.apply(scene,'no-star-glow'); assert.equal(mesh.visible,false); restore(); assert.equal(mesh.visible,true);
 restore=experiment.apply(scene,'unlit-materials'); assert.equal(mesh.material.isMeshBasicMaterial,true); restore(); assert.equal(mesh.material,mat);
 mesh.visible=false; restore=experiment.apply(scene,'no-star-glow'); restore(); assert.equal(mesh.visible,false);
 experiment.dispose(); mesh.geometry.dispose(); mat.dispose();
});
test('tree trials leave unrelated shared materials untouched and restore source',()=>{
 const scene=new Scene(), group=new Group();group.name='Snow360Trees';scene.add(group);
 const material=new MeshStandardMaterial();const tree=new Mesh(new BoxGeometry(),material), rider=new Mesh(tree.geometry,material);
 group.add(tree);scene.add(rider);const experiment=createRenderDiagnostics();
 for (const variant of ['tree-diffuse','tree-front-faces','tree-unlit']) {
  const restore=experiment.apply(scene,variant);
  assert.notEqual(tree.material,material);assert.equal(rider.material,material);
  if(variant==='tree-diffuse')assert.equal(tree.material.isMeshLambertMaterial,true);
  if(variant==='tree-front-faces')assert.equal(tree.material.side,0);
  restore();assert.equal(tree.material,material);
 }
 assert.equal(diagnosticWindow(3500,'trees').variant,'tree-diffuse');
 experiment.dispose();tree.geometry.dispose();material.dispose();
});
