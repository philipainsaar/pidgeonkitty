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
