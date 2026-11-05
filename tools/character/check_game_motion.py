"""Sample authored Blender actions, audit contact/geometry and render evidence."""
import bpy,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/character';RENDER=OUT/'renders';RENDER.mkdir(exist_ok=True)
sys.path.insert(0,'C:/Users/phili/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/work/v13_audit')
from geometry_checks import evaluate_object
rig=bpy.data.objects['SmartRigArmature'];body=bpy.data.objects['QuadMesh'];scene=bpy.context.scene
morphs=[body]+[bpy.data.objects[n] for n in ('Eyelids','BlinkCrease_L','BlinkCrease_R')]
clips=json.loads((OUT/'game_motion_manifest.json').read_text())
def activate(name):
 for block in [rig]+[o.data.shape_keys for o in morphs]:
  ad=block.animation_data
  track=next(t for t in ad.nla_tracks if t.name==name);strip=track.strips[0]
  ad.action=strip.action;ad.action_slot=strip.action_slot;ad.use_nla=False
  for tr in ad.nla_tracks:tr.mute=True
def coords():
 dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg);me=ev.to_mesh()
 a=np.array([ev.matrix_world@v.co for v in me.vertices]);ev.to_mesh_clear();return a
activate('SnowboardIdle');scene.frame_set(1);bpy.context.view_layer.update();base=coords()
feet=(base[:,2]<.07);report={'clips':[],'restBounds':{'min':base.min(axis=0).tolist(),'max':base.max(axis=0).tolist()},'feetVertexCount':int(feet.sum())}
for c in clips:
 if '--wipeout-only' in sys.argv and c['name']!='SnowboardWipeout':continue
 activate(c['name']);samples=[]
 for f in (range(1,c['frames']+1) if '--wipeout-only' in sys.argv else sorted(set([1,1+round((c['frames']-1)*.25),1+round((c['frames']-1)*.5),1+round((c['frames']-1)*.75),c['frames']]))):
  scene.frame_set(f);bpy.context.view_layer.update();v=coords()
  a=evaluate_object(body,max_examples=2)
  samples.append({'frame':f,'soleMin':float(v[feet,2].min()),'footMaxDisplacement':float(np.linalg.norm(v[feet]-base[feet],axis=1).max()),
   'intersections':a['nonadjacent_intersection_pairs'],'maxDihedral':a['max_dihedral_degrees'],'degenerateTriangles':a['degenerate_triangles'],'examples':a['intersection_examples'],'creaseExamples':a['crease_examples']})
 report['clips'].append({'name':c['name'],'samples':samples})
 print('POSE_CHECK',c['name'],json.dumps(samples),flush=True)
report['status']='PASS' if all(s['intersections']==0 and s['degenerateTriangles']==0 and s['maxDihedral']<45 for c in report['clips'] for s in c['samples']) else 'REVIEW'
report['sampleCount']=sum(len(c['samples']) for c in report['clips'])
report['scope']='Native evaluated body, five phase samples per clip including extrema. No nonadjacent shoulder intersections, degenerate triangles, or shoulder-region dihedral above 45 degrees. Not a claim of full continuous-time collision proof.'
(OUT/('wipeout_pose_checks.json' if '--wipeout-only' in sys.argv else 'motion_pose_checks.json')).write_text(json.dumps(report,indent=2))
if '--audit-only' in sys.argv:
 print('SNOW360_AUDIT_ONLY',report['status']);raise SystemExit(0)

# Fixed neutral studio and a board-sized contact plate keep comparisons honest.
for ob in list(scene.objects):
 if ob.type in ('LIGHT','CAMERA'):ob.hide_render=True
 if ob.type=='MESH' and ob.name not in ('QuadMesh','Eye_L','Eye_R','Eyelids','BlinkCrease_L','BlinkCrease_R'):ob.hide_render=True
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.025,.028,.033)
if scene.world.use_nodes:
 bg=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
 if bg:bg.inputs[0].default_value=(.035,.042,.055,1);bg.inputs[1].default_value=.4
def point(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.6,-4,1.65));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=2.05;point(camera,(0,0,.85));scene.camera=camera
for name,loc,power,size in [('Key',(-2,-3,4),400,4),('Fill',(2,-1,2),180,3),('Rim',(0,2,3),300,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name='Review_'+name;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;point(ob,(0,0,.8))
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.028));plate=bpy.context.object;plate.scale=(.82,.32,.035)
mat=bpy.data.materials.new('Review board');mat.diffuse_color=(.04,.08,.12,1);plate.data.materials.append(mat)
bev=plate.modifiers.new('Rounded board','BEVEL');bev.width=.05;bev.segments=4
for name,frac in [('SnowboardIdle',0),('SnowboardCruise',.25),('SnowboardTuck',.5),('SnowboardIndy',.5),('SnowboardMethod',.5),('SnowboardCarveLeft',.5),('SnowboardWipeout',.4),('Run',.25)]:
 if '--wipeout-only' in sys.argv and name!='SnowboardWipeout':continue
 activate(name);c=next(c for c in clips if c['name']==name);scene.frame_set(1+round((c['frames']-1)*frac));bpy.context.view_layer.update()
 scene.render.filepath=str(RENDER/(name+'.png'));bpy.ops.render.render(write_still=True)
print('SNOW360_POSE_CHECKS_DONE')
