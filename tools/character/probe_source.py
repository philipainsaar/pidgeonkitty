import bpy,json,os
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parents[2]/'art/character';out.mkdir(parents=True,exist_ok=True)
rig=bpy.data.objects['SmartRigArmature']
for ob in [rig]+[o.data.shape_keys for o in bpy.data.objects if o.type=='MESH' and o.data.shape_keys]:
 a=ob.animation_data
 if a:
  a.action=None;a.use_nla=False
  for t in a.nla_tracks:t.mute=True
rig.data.pose_position='REST';bpy.context.view_layer.update()
report={'rig_transform':[list(x) for x in rig.matrix_world],'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in rig.data.bones},'objects':{}}
dg=bpy.context.evaluated_depsgraph_get()
for ob in bpy.context.scene.objects:
 if ob.type!='MESH' or ob.name not in ['QuadMesh','Eye_L','Eye_R','Eyelids','BlinkCrease_L','BlinkCrease_R']:continue
 ev=ob.evaluated_get(dg);me=ev.to_mesh();vs=[ob.matrix_world@v.co for v in me.vertices]
 report['objects'][ob.name]={'min':[min(v[i] for v in vs) for i in range(3)],'max':[max(v[i] for v in vs) for i in range(3)],'vertices':len(vs),'polygons':len(me.polygons),'morphs':[k.name for k in ob.data.shape_keys.key_blocks] if ob.data.shape_keys else []}
 ev.to_mesh_clear()
report['materials']={m.name:[{'type':n.type,'label':n.label,'image':n.image.filepath if n.type=='TEX_IMAGE' and n.image else None} for n in m.node_tree.nodes] for m in bpy.data.materials if m.use_nodes}
(out/'source_probe.json').write_text(json.dumps(report,indent=2));print('SOURCE_PROBE_DONE')
