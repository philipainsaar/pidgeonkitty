#!/usr/bin/env python3
"""SNOW360 V50 ramp pack: apply code changes to an existing pidgeonkitty repo.
Run `py apply_snow360_ramps.py` from the repository root after extracting the zip.
Copies original modified files to a timestamped backup directory.
Idempotent: safe to run twice. Does not touch other game systems.
"""
from __future__ import annotations
from datetime import datetime
from pathlib import Path
import re, shutil, sys

ROOT=Path(__file__).resolve().parent
FILES={
    'components/snow64ModelConfig.js',
    'components/snow64Endless.js',
    'components/SnowboardGame.jsx',
    'components/snow64Collision.js',
}

def sub_once(text, original, replacement, fname):
    if replacement in text:return text
    count=text.count(original)
    if count!=1:raise ValueError(f'{fname}: expected patch anchor once, found {count}: {original[:100]!r}')
    return text.replace(original,replacement,1)

def change_config(s):
    f='snow64ModelConfig.js'
    s=sub_once(s,'  ramp: "/models/snow64-ramp.glb",\n  superRamp: "/models/snow64-super-ramp.glb",',
      '  ramp: "/models/snow360-ramp-1.glb",\n  ramp2: "/models/snow360-ramp-2.glb",\n  superRamp: "/models/snow360-ramp-3-big-air.glb",', f)
    s=sub_once(s,'tree: [1,1,1], rock: [1,1,1], ramp: [1,1,1], superRamp: [1,1,1],',
       'tree: [1,1,1], rock: [1,1,1], ramp: [1,1,1], ramp2: [1,1,1], superRamp: [1,1,1],', f)
    return s

def change_endless(s):
    f='snow64Endless.js'
    s=sub_once(s,'ramps.push({id:`ramp-${row}`,x:SNOW_LANES[1+Math.floor(random()*3)],z,index:row,height,length,superAir});',
        'ramps.push({id:`ramp-${row}`,x:SNOW_LANES[1+Math.floor(random()*3)],z,index:row,height,length,superAir,variant:Math.floor(random()*2)});',f)
    return s

def change_game(s):
    f='SnowboardGame.jsx'
    old='''function Ramp({ x, z, index, height = 1.12, length = 3, superAir = false }) {
  const regularModel=useSnowModel("ramp");
  const superModel=useSnowModel("superRamp");
  const custom=(superAir && superModel) || regularModel;
  const type=superAir&&superModel ? "superRamp" : "ramp";'''
    new='''function Ramp({ x, z, index, height = 1.12, length = 3, superAir = false, variant = 0 }) {
  // Variant 0/1 are the two ordinary sherpa ramps; Super Air always uses Ramp 3.
  // All calls are unconditional hooks. If a file is missing the procedural ramp remains safe.
  const ramp1 = useSnowModel("ramp");
  const ramp2 = useSnowModel("ramp2");
  const bigAir = useSnowModel("superRamp");
  const custom = superAir ? bigAir : (variant === 1 ? (ramp2 || ramp1) : (ramp1 || ramp2));
  const type = superAir ? "superRamp" : (variant === 1 ? "ramp2" : "ramp");'''
    return sub_once(s,old,new,f)

def change_collision(s):
    f='snow64Collision.js'
    old='const END_PAD = 0.24; // prevent narrow gaps near ramp ends'
    new='''const END_PAD = 0.24; // prevent narrow gaps near ramp ends

// V50: Riding surface sampled from the authored curved sherpa-ramp meshes.
// t=0 is the near (+Z) entry, t=1 is the upper (-Z) takeoff lip.
// The same shape is used for ordinary ramps 1/2 and taller Big Air ramp 3.
const SHERPA_RAMP_DECK = [0, 0, 0.01, 0.04, 0.10, 0.20, 0.35, 0.63, 0.85, 0.86, 1];
function rampDeckFraction(t) {
  const scaled = clamp(t, 0, 1) * (SHERPA_RAMP_DECK.length - 1);
  const a = Math.min(Math.floor(scaled), SHERPA_RAMP_DECK.length - 2);
  return SHERPA_RAMP_DECK[a] + (SHERPA_RAMP_DECK[a+1] - SHERPA_RAMP_DECK[a]) * (scaled - a);
}'''
    s=sub_once(s,old,new,f)
    s=sub_once(s,'return terrainHeight(ramp.x, ramp.z) + t * ramp.height;',
          'return terrainHeight(ramp.x, ramp.z) + rampDeckFraction(t) * ramp.height;',f)
    s=sub_once(s,'const height = terrainHeight(ramp.x, ramp.z) + ramp.height * clamp((ramp.z + half - z) / (2 * half), 0, 1);',
          'const height = rampTopAt(ramp, side, z, terrainHeight) ?? terrainHeight(ramp.x, ramp.z);',f)
    return s

PATCHES={
 'components/snow64ModelConfig.js': change_config,
 'components/snow64Endless.js': change_endless,
 'components/SnowboardGame.jsx': change_game,
 'components/snow64Collision.js': change_collision,
}

def main():
    if not (ROOT/'package.json').exists():
        print('ERROR: Please extract the zip directly into your pidgeonkitty repo root, where package.json exists.')
        sys.exit(1)
    paths={name:ROOT/name for name in FILES}
    absent=[str(p) for p in paths.values() if not p.exists()]
    if absent:
        print('ERROR: Missing game files:', '\n'.join(absent));sys.exit(1)
    assets=[ROOT/'public/models'/name for name in ['snow360-ramp-1.glb','snow360-ramp-2.glb','snow360-ramp-3-big-air.glb']]
    if any(not x.exists() for x in assets):
        print('ERROR: Ramp GLBs must be extracted under public/models/.');sys.exit(1)
    changes={}
    try:
        for name,transform in PATCHES.items():
            original=paths[name].read_text(encoding='utf-8')
            converted=transform(original)
            if converted!=original:changes[name]=(original,converted)
    except Exception as err:
        print('ERROR: No files were modified. The game version may have changed:',err);sys.exit(1)
    if not changes:
        print('SNOW360 Ramps already installed; no further edits needed.');return
    backup=ROOT/'.snow360-ramp-backup'/datetime.now().strftime('%Y%m%d-%H%M%S')
    for name,(original,_) in changes.items():
        destination=backup/name;destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_text(original,encoding='utf-8')
    for name,(_,converted) in changes.items():
        paths[name].write_text(converted,encoding='utf-8')
        print('Updated',name)
    print(f'Installed all 3 ramps! Backup: {backup.relative_to(ROOT)}')
    print('Next: npm run build, then commit/push in GitHub Desktop.')

if __name__=='__main__':main()
