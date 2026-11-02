#!/usr/bin/env python3
"""SNOW360 V51: restore straight procedural ramps + blue/yellow/pink cloud fleece.

Run from pidgeonkitty root after extracting the V51 ZIP into that directory:
    py apply_snow360_procedural_ramps.py

Supports the original game and the earlier V50 curved-GLB ramp patch.
Makes timestamped backups before editing files or removing old V50 GLBs.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent
REQUIRED = (
    "components/SnowboardGame.jsx",
    "components/snow64Collision.js",
    "components/snow64Endless.js",
    "components/snow64ModelConfig.js",
)
ASSETS = (
    "components/Snow360CloudRamps.jsx",
    "public/textures/snow360-cloud-blue.jpg",
    "public/textures/snow360-cloud-yellow.jpg",
    "public/textures/snow360-cloud-pink.jpg",
)
OBSOLETE_V50_GLB = (
    "public/models/snow360-ramp-1.glb",
    "public/models/snow360-ramp-2.glb",
    "public/models/snow360-ramp-3-big-air.glb",
)


def replace_one(s: str, old: str, new: str, label: str) -> str:
    if new in s and old not in s:
        return s
    n = s.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected anchor once, found {n}: {old[:105]!r}")
    return s.replace(old, new, 1)


def patch_game(s: str) -> str:
    label = "SnowboardGame.jsx"
    imp = 'import Snow360CloudRamp from "./Snow360CloudRamps";'
    if imp not in s:
        s = replace_one(s, '"use client";\n', '"use client";\n\n' + imp + '\n', label)

    if 'const Ramp = Snow360CloudRamp;' not in s:
        begin = s.find('\nfunction Ramp(')
        if begin < 0:
            raise RuntimeError(f"{label}: can't locate old Ramp function")
        end = s.find('/** Original frost-spark mushroom', begin)
        if end < 0:
            raise RuntimeError(f"{label}: can't locate end of old Ramp function")
        old = s[begin:end]
        if not any(piece in old for piece in ('useSnowModel("ramp")', 'meshLambertMaterial', 'ramp2')):
            raise RuntimeError(f"{label}: ramp function isn't a recognized original/V50 version")
        s = s[:begin] + '\n// V51: procedural, texture-mapped wedge; no GLB/half-pipe geometry.\nconst Ramp = Snow360CloudRamp;\n\n' + s[end:]

    old = '{data.ramps.map(r=><Ramp key={r.id} {...r} />)}'
    new = '{data.ramps.map(r=><Ramp key={r.id} {...r} groundHeight={groundY(r.x,r.z)} />)}'
    if old in s:
        s = replace_one(s, old, new, label)
    elif new not in s:
        raise RuntimeError(f"{label}: can't find course ramp placement")
    return s


def patch_config(s: str) -> str:
    # Disable unused ramp GLB requests; procedural geometry always wins.
    pattern = r'(?m)^  ramp: [^\n]*\n(?:  ramp2: [^\n]*\n)?  superRamp: [^\n]*'
    new = '  ramp: null,\n  ramp2: null,\n  superRamp: null,'
    replaced, n = re.subn(pattern, new, s, count=1)
    if n != 1:
        raise RuntimeError('snow64ModelConfig.js: cannot locate ramp models config')
    return replaced


def patch_endless(s: str) -> str:
    # Preserve the V50 randomized regular-ramp variants if already present.
    if re.search(r'ramps\.push\(\{id:`ramp-\$\{row\}`[^;]*\bvariant:', s):
        return s
    original = 'ramps.push({id:`ramp-${row}`,x:SNOW_LANES[1+Math.floor(random()*3)],z,index:row,height,length,superAir});'
    # Hash row ID to vary blue/yellow without consuming extra calls to the
    # seededRandom RNG (so token/rock/tree positions stay unchanged).
    replacement = 'ramps.push({id:`ramp-${row}`,x:SNOW_LANES[1+Math.floor(random()*3)],z,index:row,height,length,superAir,variant:(Math.imul(row ^ 0x3c6ef35f, 0x45d9f3b) >>> 23) & 1});'
    return replace_one(s, original, replacement, 'snow64Endless.js')


def patch_collision(s: str) -> str:
    label = 'snow64Collision.js'
    # Remove the V50 half-pipe collision curve (only when it's present).
    if 'const SHERPA_RAMP_DECK =' in s:
        start = s.find('// V50: Riding surface sampled from the authored curved sherpa-ramp meshes.')
        end = s.find('/** Surface of the solid ramp deck', start)
        if start < 0 or end < start:
            raise RuntimeError(f'{label}: cannot safely remove V50 deck curve')
        s = s[:start] + s[end:]

    # Keep the collision footprint padding, but not in the height equation:
    # this makes the playable height exactly match the geometry at all points.
    s = replace_one(s,
        'const t = clamp((ramp.z + half + END_PAD - z) / (2 * half + END_PAD), 0, 1);',
        'const t = clamp((ramp.z + half - z) / (2 * half), 0, 1);',label)
    old_v50 = 'return terrainHeight(ramp.x, ramp.z) + rampDeckFraction(t) * ramp.height;'
    new = 'return terrainHeight(ramp.x, ramp.z) + t * ramp.height;'
    if old_v50 in s:
        s = replace_one(s, old_v50, new, label)
    elif new not in s:
        raise RuntimeError(f'{label}: cannot find deck height equation')

    old_v50 = 'const height = rampTopAt(ramp, side, z, terrainHeight) ?? terrainHeight(ramp.x, ramp.z);'
    new = 'const height = terrainHeight(ramp.x, ramp.z) + ramp.height * clamp((ramp.z + half - z) / (2 * half), 0, 1);'
    if old_v50 in s:
        s = replace_one(s, old_v50, new, label)
    elif new not in s:
        raise RuntimeError(f'{label}: cannot find side collision equation')
    if 'rampDeckFraction' in s or 'SHERPA_RAMP_DECK' in s:
        raise RuntimeError(f'{label}: V50 ramp curve was not fully removed')
    return s


PATCHES = {
    'components/SnowboardGame.jsx': patch_game,
    'components/snow64Collision.js': patch_collision,
    'components/snow64Endless.js': patch_endless,
    'components/snow64ModelConfig.js': patch_config,
}


def main() -> int:
    if not (ROOT / 'package.json').is_file():
        print('ERROR: Extract the ZIP directly into the pidgeonkitty project root (alongside package.json).')
        return 1
    missing = [f for f in (*REQUIRED, *ASSETS) if not (ROOT / f).is_file()]
    if missing:
        print('ERROR: Missing files: ' + ', '.join(missing))
        return 1

    # Validate all four patches before modifying anything.
    changes = {}
    try:
        for name, func in PATCHES.items():
            original = (ROOT / name).read_text(encoding='utf-8')
            revised = func(original)
            if revised != original:
                changes[name] = (original, revised)
    except (RuntimeError, UnicodeError) as ex:
        print(f'ERROR: No game code was changed. {ex}')
        return 1

    obsolete = [name for name in OBSOLETE_V50_GLB if (ROOT / name).exists()]
    if not changes and not obsolete:
        print('SNOW360 V51 is already installed. No changes needed.')
        return 0

    backup_root = ROOT / '.snow360-ramp-backup' / ('V51-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    for name in (*changes.keys(), *obsolete):
        dst = backup_root / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        if name in changes:
            dst.write_text(changes[name][0], encoding='utf-8')
        else:
            shutil.copy2(ROOT / name, dst)

    # Do not accidentally commit backups in GitHub Desktop.
    git_exclude = ROOT / '.git' / 'info' / 'exclude'
    if git_exclude.is_file():
        existing = git_exclude.read_text(encoding='utf-8')
        if '.snow360-ramp-backup/' not in existing:
            with git_exclude.open('a', encoding='utf-8') as fh:
                fh.write('\n.snow360-ramp-backup/\n')

    for name, (_, revised) in changes.items():
        (ROOT / name).write_text(revised, encoding='utf-8')
        print('Updated:', name)
    for name in obsolete:
        (ROOT / name).unlink()
        print('Removed unused V50 GLB:', name)

    print('\nSNOW360 V51 installed: straight procedural ramps, blue/yellow regulars, pink Big Air.')
    print('Backups:', backup_root.relative_to(ROOT))
    print('Check with: npm run build')
    print('Then commit & push through GitHub Desktop to deploy.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
