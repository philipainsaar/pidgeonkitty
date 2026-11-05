"""Author SNOW360 in-place motions on the validated V13 SmartRig.

Run with Blender 5.1 in background on the supplied V13 .blend. The game owns
travel, board banking and full-body flips, so these clips never duplicate them.
The output JSON is decoded from Blender's actual glTF animation export.
"""
import bpy, json, math, struct
from pathlib import Path
from mathutils import Matrix, Vector, Euler

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/character'; OUT.mkdir(parents=True,exist_ok=True)
FPS=24
SPECS=[
 ('SnowboardIdle',4,True,'Quiet binding stance with breathing and a small look around'),
 ('SnowboardCruise',2,True,'Balanced riding with soft upper-body absorption'),
 ('SnowboardTuck',2,True,'Low aerodynamic crouch, arms forward and tucked'),
 ('SnowboardCarveLeft',2,True,'Left-edge anticipation with counterbalanced arms'),
 ('SnowboardCarveRight',2,True,'Right-edge anticipation with counterbalanced arms'),
 ('SnowboardOllie',.75,False,'Compress, extend and gather; gameplay owns jump height'),
 ('SnowboardLanding',.50,False,'Impact compression, antenna follow-through and recovery'),
 ('SnowboardIndy',.75,False,'Front-facing compact grab gesture'),
 ('SnowboardMethod',.95,False,'Asymmetric extended method silhouette'),
 ('SnowboardTailgrab',.80,False,'Reach toward rear binding with opposite arm balancing'),
 ('SnowboardNosegrab',.80,False,'Reach toward front binding with opposite arm balancing'),
 ('SnowboardFrontflip',.90,False,'Gather then open; gameplay owns the full rotation'),
 ('SnowboardWipeout',1.15,False,'Balance loss, asymmetric brace, impact compression and damped settling'),
 ('SnowboardRemount',.80,False,'Anticipation, compact airborne remount and planted finish'),
 ('Run',.65,True,'Alternating short plush strides with opposed arm swing'),
]
rig=bpy.data.objects['SmartRigArmature']
body=bpy.data.objects['QuadMesh']
morphs=[body]+[bpy.data.objects[n] for n in ('Eyelids','BlinkCrease_L','BlinkCrease_R')]
rest={b.name:b.matrix_local.to_quaternion() for b in rig.data.bones}
restm={b.name:b.matrix_local.copy() for b in rig.data.bones}
clip_actions={}; reports=[]

def ss(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def envelope(t,a=.18,b=.25):return ss(t/a)*ss((1-t)/b)
def blink(t,start):
 q=(t-start)*FPS
 if q<=0 or q>=8:return 0.
 if q<=3:return ss(q/3)
 if q<=4:return 1.
 return 1-ss((q-4)/4)
def reset(block):
 ad=block.animation_data_create();ad.action=None;ad.use_nla=False
 for track in list(ad.nla_tracks):ad.nla_tracks.remove(track)
 return ad
def curves(action):
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:yield from bag.fcurves
def stash(block,action,name,end):
 ad=block.animation_data;slot=ad.action_slot
 for curve in curves(action):
  for key in curve.keyframe_points:key.interpolation='LINEAR'
 ad.action=None
 tr=ad.nla_tracks.new();tr.name=name;tr.mute=True
 st=tr.strips.new(name,1,action);st.action_slot=slot
 st.action_frame_start=1;st.action_frame_end=end;st.frame_end=end
 st.blend_type='REPLACE';st.extrapolation='NOTHING'
def activate(name):
 for block,action in clip_actions[name]:
  ad=block.animation_data;ad.action=action;ad.action_slot=action.slots[0];ad.use_nla=False
  for tr in ad.nla_tracks:tr.mute=True
 bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=round(next(s[1] for s in SPECS if s[0]==name)*FPS)+1
 bpy.context.scene.frame_set(1);bpy.context.view_layer.update()

def pose(name,t):
 """Small armature-space controls; lower riding chain deliberately stays fixed."""
 ph=math.tau*t; wave=math.sin(ph); breathing=.5-.5*math.cos(ph)
 rot={'Bone_013':Vector((-.035,-.35,0)), 'Bone_018':Vector((-.035,.35,0)),
      'Bone_012':Vector((0,-.03,0)),'Bone_017':Vector((0,.03,0)),
      'Bone_010':Vector((-.025,0,0)),'Bone_015':Vector((.018,0,0))}
 move={}; squash=.994+.006*breathing
 def add(b,x=0,y=0,z=0):rot.setdefault(b,Vector((0,0,0)));rot[b]+=Vector((x,y,z))
 def upper(x=0,y=0,z=0):add('Bone_010',x,y,z)
 def arm(side,x=0,y=0,z=0,fx=0,fy=0):
  u,f=('Bone_013','Bone_012') if side=='L' else ('Bone_018','Bone_017')
  add(u,x,y,z);add(f,fx,fy)
 crouch=0.;energy=.035
 if name=='SnowboardIdle':
  rot['Bone_013']=Vector((0,-.55,0));rot['Bone_018']=Vector((0,.55,0))
  add('Bone_015',x=.008*wave,z=.065*wave)
 elif name=='SnowboardCruise':
  crouch=.022+.006*breathing;upper(x=.012*wave)
  # Normal coasting is the relaxed arms-down idle, not the A-pose.
  rot['Bone_013']=Vector((-.01,-.55+.006*wave,0))
  rot['Bone_018']=Vector((-.01,.55-.006*wave,0))
  add('Bone_015',z=.16+.012*wave);energy=.055
 elif name=='SnowboardTuck':
  crouch=.065+.004*breathing;squash=.94
  upper(x=-.12);add('Bone_015',x=.10,z=.18)
  arm('L',x=-.23,y=-.16,fx=-.20);arm('R',x=-.23,y=.16,fx=-.20);energy=.045
 elif name in ('SnowboardCarveLeft','SnowboardCarveRight'):
  d=1 if name.endswith('Left') else -1
  crouch=.038+.004*breathing;upper(x=d*.085,y=d*.06)
  add('Bone_015',x=-d*.05,y=-d*.04,z=.20*d)
  arm('L',x=-d*.12,y=.10+d*.08,z=d*.035)
  arm('R',x=d*.12,y=-.10+d*.08,z=d*.035);energy=.08
 elif name=='SnowboardOllie':
  prep=ss(t/.18)*(1-ss((t-.20)/.22));gather=envelope(t,.30,.22)
  crouch=.065*prep+.025*gather;squash=1-.05*prep
  arm('L',x=-.08*gather,y=.25*gather);arm('R',x=-.08*gather,y=-.25*gather)
  add('Bone_015',x=.035*gather);energy=.12*gather
 elif name=='SnowboardLanding':
  hit=math.sin(math.pi*min(1,t/.6))**2 if t<.6 else 0
  crouch=.075*hit;squash=1-.055*hit;upper(x=-.07*hit)
  arm('L',x=-.10*hit,y=.18*hit);arm('R',x=-.10*hit,y=-.18*hit)
  add('Bone_015',x=.065*hit);energy=.16*hit
 elif name in ('SnowboardIndy','SnowboardMethod','SnowboardTailgrab','SnowboardNosegrab'):
  e=envelope(t);crouch=.070*e;squash=1-.065*e;upper(x=-.08*e)
  if name=='SnowboardIndy':
   arm('R',x=-.28*e,y=.22*e,fx=-.16*e)
   arm('L',x=.05*e,y=.35*e,z=-.10*e)
   add('Bone_015',x=.055*e,z=-.12*e)
  elif name=='SnowboardMethod':
   arm('L',x=.16*e,y=.56*e,z=-.12*e,fy=.10*e)
   arm('R',x=-.28*e,y=.16*e,fx=-.12*e)
   upper(y=-.09*e,z=-.08*e);add('Bone_015',z=.14*e)
  else:
   d=1 if name=='SnowboardTailgrab' else -1
   upper(y=d*.12*e,z=d*.065*e)
   reach='R' if d>0 else 'L';balance='L' if d>0 else 'R'
   arm(reach,x=-.22*e,y=d*.25*e,fx=-.14*e)
   arm(balance,x=.06*e,y=d*.30*e,z=-d*.08*e)
   add('Bone_015',z=-d*.20*e,y=-d*.06*e)
  energy=.09*e
 elif name=='SnowboardFrontflip':
  e=envelope(t,.20,.25);crouch=.075*e;squash=1-.055*e
  upper(x=-.10*e);add('Bone_015',x=-.045*e)
  arm('L',x=-.22*e,y=-.12*e,fx=-.18*e);arm('R',x=-.22*e,y=.12*e,fx=-.18*e)
  energy=.16*e
 elif name=='SnowboardWipeout':
  # Loss of balance, protective brace, impact compression, then settle.
  reach=ss(t/.12)*(1-ss((t-.28)/.28))
  brace=ss((t-.12)/.20)
  impact=math.exp(-((t-.46)/.13)**2)
  settle=ss((t-.63)/.37)
  recoil=math.sin(math.pi*max(0,min(1,(t-.44)/.38)))
  crouch=.010*brace+.010*impact;squash=1-.014*brace-.018*impact
  upper(x=-.025*brace,y=.015*reach,z=-.025*impact)
  arm('L',x=-.035*brace,y=.30*reach-.08*brace,z=.04*reach,fx=-.045*brace)
  arm('R',x=-.045*brace,y=-.25*reach+.09*brace,z=-.045*reach,fx=-.055*brace)
  add('Bone_004',x=.17*reach+.07*brace*(1-.4*settle))
  add('Bone_007',x=-.13*reach+.04*brace*(1-.4*settle))
  add('Bone_003',x=-.055*brace);add('Bone_006',x=-.04*brace)
  add('Bone_015',x=.025*reach-.045*brace+.018*recoil,z=.025*reach)
  energy=.10*reach+.035*recoil
 elif name=='SnowboardRemount':
  prep=math.sin(math.pi*min(1,t/.35))**2 if t<.35 else 0
  gather=envelope(t,.30,.25);land=math.sin(math.pi*max(0,min(1,(t-.7)/.3)))**2
  crouch=.06*prep+.04*land;squash=1-.04*prep-.035*land
  arm('L',x=-.10*gather,y=.28*gather);arm('R',x=-.10*gather,y=-.28*gather)
  add('Bone_015',x=.025*gather);energy=.12*gather
 elif name=='Run':
  stride=math.sin(ph);crouch=.006*(1-math.cos(ph*2))
  upper(x=-.07);add('Bone_015',x=.05,z=-.02*stride)
  add('Bone_004',x=.38*stride);add('Bone_007',x=-.38*stride)
  add('Bone_003',x=-.18*max(0,-stride));add('Bone_006',x=-.18*max(0,stride))
  add('Bone_002',x=-.08*stride);add('Bone_005',x=.08*stride)
  arm('L',x=-.16*stride,y=-.13);arm('R',x=.16*stride,y=.13)
  energy=.09
 # Plush shoulder limits: forward reach is distributed through the chest and
 # upper limb. Deep humanoid elbows fold this character's very short mittens.
 # These limits are verified against the actual weighted surface, not bones.
 if name in ('SnowboardTuck','SnowboardIndy','SnowboardMethod','SnowboardTailgrab','SnowboardNosegrab','SnowboardFrontflip'):
  crouch*=.35;squash=1+(squash-1)*.35
  for b in ('Bone_013','Bone_018','Bone_012','Bone_017'):
   if b in rot:rot[b].x*=.35
  for b,neutral in [('Bone_013',-.35),('Bone_018',.35)]:
   rot[b].y=neutral+(rot[b].y-neutral)*.65
  rot['Bone_010']*=.60
 if name in ('SnowboardOllie','SnowboardLanding'):
  crouch*=.40;squash=1+(squash-1)*.40
 # Move the chest in armature space, not through arbitrary local bone axes.
 move['Bone_010']=Vector((0,0,-crouch))
 for side,sgn in (('L',-1),('R',1)):
  delay=0 if side=='L' else .22
  add('ACATX_Antenna_'+side+'_Base',x=energy*math.sin(ph+delay),y=sgn*.025*wave)
  add('ACATX_Antenna_'+side+'_Tip',x=energy*1.35*math.sin(ph+delay-.30),y=sgn*.035*math.sin(ph-.25))
 add('ACATX_Tail_Base',z=.07*wave,x=.025*math.sin(ph))
 add('ACATX_Tail_Tip',z=.09*math.sin(ph-.3))
 return rot,move,squash

reset(rig)
for obj in morphs:
 ad=reset(obj.data.shape_keys)
 for driver in list(ad.drivers):ad.drivers.remove(driver)
 for key in obj.data.shape_keys.key_blocks:key.value=0
for old_action in list(bpy.data.actions):
 if old_action.get('SNOW360') or any(old_action.name==s[0] or old_action.name.startswith(s[0]+'__') for s in SPECS):
  bpy.data.actions.remove(old_action)
rig.location=(0,0,0);rig.rotation_euler=(0,0,0);rig.scale=(1,1,1)
rig.data.pose_position='POSE';rig['Wave_Round']=0.
scene=bpy.context.scene;scene.render.fps=FPS;scene.render.fps_base=1.

for name,duration,loop,desc in SPECS:
 end=round(duration*FPS)+1;duration=(end-1)/FPS
 a=bpy.data.actions.new(name);a.use_fake_user=True;a['SNOW360']=True;a['Loop']=loop;a['Description']=desc
 rig.animation_data.action=a;clip_actions[name]=[(rig,a)]
 for frame in range(1,end+1):
  t=(frame-1)/(end-1);angles,locations,squash=pose(name,t)
  for pb in rig.pose.bones:
   pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)
   q=rest[pb.name];world=Euler(angles.get(pb.name,(0,0,0)),'XYZ').to_quaternion()
   pb.rotation_quaternion=q.inverted()@world@q
   pb.location=q.inverted()@locations.get(pb.name,Vector((0,0,0)))
   if pb.name=='Bone_010':pb.scale=(squash,)*3
   if pb.name=='Bone_015':pb.scale=(1/squash,)*3
   for prop in ('location','rotation_quaternion','scale'):pb.keyframe_insert(prop,frame=frame,group=pb.name)
  # The armature object is intentionally stationary in every game action.
  for prop in ('location','rotation_euler','scale'):rig.keyframe_insert(prop,frame=frame,group='In place')
 stash(rig,a,name,end)
 for obj in morphs:
  keys=obj.data.shape_keys;ka=bpy.data.actions.new(name+'__'+obj.name);ka.use_fake_user=True;ka['SNOW360']=True;keys.animation_data.action=ka
  clip_actions[name].append((keys,ka))
  for frame in range(1,end+1):
   sec=(frame-1)/FPS
   starts=[.8,2.7] if duration>=3 else ([.85] if duration>=1.5 else [])
   blinkv=max([blink(sec,s) for s in starts]+[0])
   if name=='SnowboardWipeout':blinkv=max(blinkv,.80*envelope((frame-1)/(end-1),.15,.3))
   for key in keys.key_blocks[1:]:
    v=0.
    if obj.name=='Eyelids':
     if key.name in ('Blink_L','Blink_R'):v=blinkv
     elif key.name.startswith('LidFix_'):v=max(0,1-abs(blinkv-int(key.name.rsplit('_',1)[1])/16)*16)
    elif obj.name.startswith('BlinkCrease_'):v=ss((blinkv-.9)/.1)
    key.value=v;key.keyframe_insert('value',frame=frame,group='Baked plush controls')
  stash(keys,ka,name,end)
 reports.append({'name':name,'duration':duration,'frames':end,'loop':loop,'description':desc})

activate('SnowboardIdle')
scene['SNOW360_Motion_Manifest']=json.dumps(reports)
scene['SNOW360_Gameplay_Contract']='In-place motions. Game owns travel, jump arc, world spin/flip. Front is Blender -Y / glTF +Z.'
for obj in bpy.data.objects:
 if obj.name.startswith('Fur'):obj.hide_render=True
for ob in bpy.data.objects:
 if ob.type=='MESH':
  for mod in ob.modifiers:
   if mod.type=='SUBSURF':mod.render_levels=mod.levels=1
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Alien_Cat_SNOW360_Animations.blend'))

# Export the skeleton alone, then decode sampled channels with exact glTF axes.
bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True)
rig.animation_data.action=None;rig.animation_data.use_nla=True
for tr in rig.animation_data.nla_tracks:tr.mute=True
path=OUT/'motion_skeleton.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
 export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,
 export_anim_slide_to_zero=True,export_frame_range=False,export_skins=True,
 export_rest_position_armature=True,export_reset_pose_bones=True,export_extras=True,
 export_cameras=False,export_lights=False)
raw=path.read_bytes();length,typ=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+length]);off=20+length
binary=raw[off+8:]
def acc(i):
 ac=doc['accessors'][i];view=doc['bufferViews'][ac['bufferView']]
 fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[ac['componentType']]
 n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[ac['type']]
 size=struct.calcsize(fmt)*n;start=view.get('byteOffset',0)+ac.get('byteOffset',0);stride=view.get('byteStride',size)
 return [list(struct.unpack_from('<'+fmt*n,binary,start+j*stride)) for j in range(ac['count'])]
result={'fps':FPS,'source':'Alien_Cat_V13.blend','coordinateSystem':'glTF local TRS, +Y up, +Z front','clips':[],'restNodes':doc['nodes']}
for animation in doc['animations']:
 name=animation['name'];report=next(r for r in reports if r['name']==name);channels=[]
 for channel in animation['channels']:
  s=animation['samplers'][channel['sampler']];node=doc['nodes'][channel['target']['node']]['name']
  channels.append({'node':node,'path':channel['target']['path'],'times':[v[0] for v in acc(s['input'])],
   'values':acc(s['output']),'interpolation':s.get('interpolation','LINEAR')})
 for obj in morphs:
  names=[k.name for k in obj.data.shape_keys.key_blocks[1:]];rows=[]
  activate(name)
  for frame in range(1,report['frames']+1):
   scene.frame_set(frame);bpy.context.view_layer.update()
   rows.append([float(obj.data.shape_keys.key_blocks[n].value) for n in names])
  channels.append({'node':'Body_Web' if obj==body else obj.name,'path':'weights','shapeNames':names,
   'times':[i/FPS for i in range(report['frames'])],'values':rows,'interpolation':'LINEAR'})
 result['clips'].append({**report,'channels':channels})
(OUT/'game_motion.json').write_text(json.dumps(result,separators=(',',':')))
(OUT/'game_motion_manifest.json').write_text(json.dumps(reports,indent=2))
print('SNOW360_MOTION_READY',len(result['clips']),str(OUT/'game_motion.json'))
