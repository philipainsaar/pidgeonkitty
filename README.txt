SNOW360 V50 - THREE PLUSH CLOUD RAMPS
==================================
Includes the three game-ready GLB assets from your 'Ramps 123.blend':
  public/models/snow360-ramp-1.glb       (BLUE cloud fleece, ordinary ramp)
  public/models/snow360-ramp-2.glb       (YELLOW cloud fleece, ordinary ramp)
  public/models/snow360-ramp-3-big-air.glb (PINK cloud fleece, SUPER BIG AIR)

Each GLB embeds its own UV-mapped 1024x1024 compressed JPEG color texture:
no external PNG/JPG dependencies. Each ramp is 524 triangles (~350 KB).
Original Blender Mix Hue sockets (yellow, pink) were read from the blend file
and baked into the textures. The GLBs are Three.js-compatible (Y-up) and
oriented so the tall lip points toward downhill (-Z). The material is soft,
fully rough, double-sided and non-metallic.

HOW TO INSTALL INTO THE EXISTING PIDGEONKITTY REPO (Windows)
============================================================
1. Extract this entire ZIP into your local pidgeonkitty project folder,
   the same folder containing package.json.
2. Open a terminal in that folder (e.g. VS Code Terminal).
3. Run:
      py apply_snow360_ramps.py
   If py is not available, use:
      python apply_snow360_ramps.py
4. Run:
      npm run build
5. Commit & push with GitHub Desktop. Vercel will deploy according to its setup.

The installer edits these 4 existing files without overwriting other systems:
  components/snow64ModelConfig.js
  components/snow64Endless.js
  components/SnowboardGame.jsx
  components/snow64Collision.js

RESULT
======
- Ordinary ramps randomly choose Ramp 1 (BLUE) or Ramp 2 (YELLOW).
- Rare Super Air / Big Air ramps always use Ramp 3 (PINK).
- The curved deck physics samples the provided geometry's approximate profile.
- Existing launch, airborne tricks, collisions and Super Air logic are retained.
- Existing model loader and automatic dimension fit are reused.
- If a GLB is missing, the existing procedural ramp is used.

NOTE ABOUT GEOMETRY AND COLLISION
=================================
The supplied Blender file contains three objects that share the same source
mesh (264 vertices, 524 triangles per ramp); their different appearances are
from materials and object transforms. The GLBs are normalized to 4x1x3 game
space, and the existing model fitter sets the actual physical heights and
lengths at runtime. The visible collision shape is approximated via a sampled
center-deck curve, not an expensive runtime triangle-mesh collider.

NOTE ABOUT TEXTURE
==================
The Blender file references //Sky Blue Sherpa Cloud Fleece.png externally.
This package uses the sky-blue sherpa cloud texture created in this chat and
bakes Blender's Hue mix colors. The image is embedded in each GLB; no texture
files are needed. The colors are best-effort matches for the material nodes,
not an Eevee/Cycles full shader bake. UV texture repeats are preserved.

BACKUPS
=======
The installer saves originals under .snow360-ramp-backup/ before editing.
It does not delete or change your Blender file, rider, other GLBs or audio.
