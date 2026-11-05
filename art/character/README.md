# Alien Cat for SNOW360

`Alien_Cat_SNOW360_Animations.blend` contains the V13 quad editing mesh, SmartRigArmature, seated eyes, progressive eyelid shapes, all eight shoulder correction shapes, editable plush material, and fifteen new game actions. Original source actions are retained as data. Matching action names are stashed on each animated shape-key datablock.

`game_motion.json` is the interchange file for the lossless GLB packer. Its bone transforms are decoded from a real Blender 5.1.2 glTF export. Morph channels are sampled from the corresponding Blender Key actions, include complete target names, and use the original progressive lid correction formulas. `motion_skeleton.glb` is the intermediate animation export.

## Animation contract

- glTF +Y is up, +Z is the character's face direction; native Blender front is -Y.
- The game owns travel, jump height, spins, flips and snowboard banking. These actions are in place.
- Riding feet remain on the original support plane. The source sole is approximately 0.0129513 above origin; scale and placement belong to the game.
- The Run cycle has alternating leg strides and opposing arms. It should face its chase travel direction, independently of the side-facing snowboard stance.
- The short plush arms use compact grab gestures. They do not physically attach to the separate game snowboard. Direct hand-to-board contact would require a further reach rig or a different stylized crouch design.
- The game-specific upper-arm and torso motion ranges are deliberately constrained to keep the continuous plush shoulder rounded. The original corrected Wave_Hello action remains available in the packed assets.
- New game clips bake every eye and body morph channel explicitly, avoiding residual waves or eyelid values when changing actions.

## Verification

`motion_pose_checks.json` records actual evaluated Blender mesh checks at five phases of every game clip, including both stride extrema. It records nonadjacent shoulder/body intersections, degenerate triangles, adjacent-face angles, sole height and foot displacement. Its scope is finite sampled poses; it is not a proof of every possible runtime blend.

`renders` contains fixed-camera native Blender stills of idle, riding, tuck, directional poses, a grab, wipeout and run. Final packed GLB validation and import comparisons are reported separately by the asset packer.

## Rebuild

Open the provided native animation blend in Blender 5.1.2 and execute `tools/character/build_game_motion.py`. It regenerates only the SNOW360 actions and writes a separate file under this directory. Execute `tools/character/check_game_motion.py` with that saved file loaded to regenerate pose checks and rendered evidence.

The verification helper currently imports the original project geometry-audit helper from its local source path. Production assets and the browser game have no dependency on that external path.
