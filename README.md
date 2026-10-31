# PidgeonKitty Frog Hopper update

This update makes the game load at **https://pidgeonkitty.vercel.app/** directly, without redirecting to `/character`.

## Installation

1. Replace your repository's `app/page.jsx` with the supplied `app/page.jsx`.
2. Add `components/FrogHopperGame.jsx` from this package to `components/`.
3. Keep your **existing** `app/layout.jsx`, `package.json`, `components/CharacterViewer.jsx` and both `.glb` files in `public/models/` unchanged.
4. Commit those two files to the `main` branch on GitHub. Vercel will redeploy.
5. Visit `https://pidgeonkitty.vercel.app/` for the game. The original animated character viewer still works at `/character`.

Your existing dependencies (`three`, `@react-three/fiber`, `@react-three/drei`, `next`, `react`, `react-dom`) suffice.

## Controls

- Arrow keys / WASD: hop one lily pad forward, backward or sideways.
- Space: hop forward.
- Touch: swipe or use the onscreen directional buttons.
- `B` or BLINK: blink on demand. Also blinks automatically during gameplay.
- `M` or CROAK: open the mouth on demand; mouth also opens during hops and when collecting fireflies.
- `P` / Esc: pause and resume.
- `Enter`: start or restart.

## Game

- Infinite procedurally generated lily-pad rows, progressively requiring lane choices.
- Glowing fireflies to collect; prickly hazards and missing lily pads to avoid.
- Hopping animation on every move, automatic idle and context-appropriate celebration/sleep animations.
- Smooth follow camera, pause controls, responsive mobile and desktop interface.
- Best score saved locally in the browser (where storage is available).
- Renders with your existing mobile 1K GLB or desktop 2K GLB.
- No sound is used.

## Facial movement: important limitation

The existing 16-bone Meshy rig does not have dedicated eyelid bones, eyelid morph targets or a full jaw rig. This code creates a lightweight pair of animated 3D eye/eyelid overlays anchored to `Bone_015` (face/head region), and animates the small weighted `Bone_014` beak-tip bone plus a dark mouth-opening overlay. The character **does blink and visually open its mouth**, but this is a practical game-ready facial approximation, not a sculpted morph-target/shape-key facial rig. For exact anatomically conforming eyelids and mouth deformations, create dedicated shapekeys or joints in Blender and export them in a new GLB.

Facial placement can be tuned via `faceTuning` near the top of `components/FrogHopperGame.jsx` if the eye or mouth overlays don't align perfectly on your particular model version.

## Files touched

- `app/page.jsx`: replace redirect-to-character with game on the root URL.
- `components/FrogHopperGame.jsx`: new self-contained 3D game.

No changes to the existing character GLB files are needed.
