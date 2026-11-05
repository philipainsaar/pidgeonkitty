# SNOW360 — Alien Cat rider

Run `npm ci`, then `npm run dev`. Open http://localhost:3000.

Alien Cat is the default rider in the welcome scene and game. Settings contains a small star button that reveals the original PidgeonKitty rider. The selection is saved locally and can be changed before a run.

The board, scoring, course generation and trick physics remain the game's existing systems. The character adds 15 in-place game motions and retains eight original character animations. The A-pose is only the rig rest pose. `/character` previews every motion with desktop/mobile quality controls.

Controls: A/D carve, W tuck, Space ollie, Shift+Space power ollie, 1–0/F tricks, C camera, P pause. Mobile retains touch steering and drawing/button trick controls.

Validation: `npm test` runs animation-transition and rider-preference checks. `npm run build` verifies the production build. `art/character/motion_pose_checks.json` records sampled Blender deformation checks; `packing_validation.json` verifies exported geometry, skinning, morphs and animation values. These are sampled checks, not a guarantee for every gameplay combination or device.

Assets: `public/models/alien-cat-snow360.glb` (desktop) and `alien-cat-snow360-mobile.glb` (mobile). Both preserve the repaired V13 geometry and progressive eyelids; strand fur is excluded. Editable animation source: `art/character/Alien_Cat_SNOW360_Animations.blend`. Authoring and packing tools are in `tools/character`.

Status: local integration, not deployed. More full-run/mobile playtesting and animation polish are still needed before treating this as a final release.
