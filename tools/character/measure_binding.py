"""Read-only Blender comparison of old/new rider contact points."""
import bpy,json,sys,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];rows=[]
for filename in ('pidgeonkitty-snowboard-v2.glb','alien-cat-snow360.glb'):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/filename))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');meshes=[o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers)]
 # Imported glTF uses frame 0 for the clip's first sample.
 for block in [rig]+[o.data.shape_keys for o in meshes if o.data.shape_keys]:
  ad=block.animation_data
  if not ad:continue
  track=next((t for t in ad.nla_tracks if t.name=='SnowboardIdle'),None)
  if track:
   ad.action=track.strips[0].action;ad.action_slot=track.strips[0].action_slot;ad.use_nla=False
   for t in ad.nla_tracks:t.mute=True
 bpy.context.scene.frame_set(0);bpy.context.view_layer.update();coords=[]
 for obj in meshes:
  ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();coords.extend([list(ev.matrix_world@v.co) for v in me.vertices]);ev.to_mesh_clear()
 p=np.array(coords);lo=p.min(0);hi=p.max(0);contact=p[p[:,2]<lo[2]+.025]
 feet={}
 for side,sgn in [('left',-1),('right',1)]:
  near=contact[contact[:,0]*sgn>0]
  feet[side]={'centroid_blender':near.mean(0).tolist(),'bottom':near[:,2].min().item(),'samples':len(near)}
 rows.append({'file':filename,'space':'Blender world XYZ (glTF XZ−Y)', 'bounds_blender':[lo.tolist(),hi.tolist()],'dimensions_blender':(hi-lo).tolist(),'foot_sole_sample_height':.025,'feet':feet,'bones':[b.name for b in rig.data.bones],'meshes':[m.name for m in meshes]})
(ROOT/'art/character/binding_measurements.json').write_text(json.dumps(rows,indent=2));print('BINDING_MEASUREMENTS',json.dumps(rows),flush=True)
