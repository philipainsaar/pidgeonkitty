# Animated 3D Character for Next.js + Three.js

This kit is created **from your uploaded Meshy AI GLB** and is ready to integrate into a Next.js App Router project. It includes **actual animated `.glb` assets**, not just animation code.

## Contents

- `public/models/character-animated.glb`: web-quality version, 2K textures, ~10 MB.
- `public/models/character-animated-mobile.glb`: mobile-friendly version, 1K textures, ~3 MB.
- `components/CharacterViewer.jsx`: complete 3D viewer, animation selector, speed slider, play/pause, mobile detection, and GLB quality selector.
- `app/character/page.jsx`: an example Next.js App Router page at `/character`.

A separate `Character_Animated_Original_4K.glb` is available outside the ZIP for the original full-resolution texture version.

## 1. Install dependencies

In your existing Next.js project:

```bash
npm install three @react-three/fiber @react-three/drei
```

Choose dependency versions compatible with the React version already installed in your project. Do not install a second copy of React.

## 2. Copy files

Copy this kit's `public/models/` directory into **your project's `public/models/`**, and `components/CharacterViewer.jsx` into your existing `components/` directory.

Optionally, copy `app/character/page.jsx` into your Next.js app if you want a complete demo route.

The GLBs use normal glTF skinning and animation, so no Draco / Meshopt decoder is needed.

## 3. Run the viewer

The sample route becomes accessible at `http://localhost:3000/character` after running your Next.js app.

To put a complete viewer on an existing page:

```jsx
import CharacterViewer from "@/components/CharacterViewer";

export default function Page() {
  return <CharacterViewer initialAnimation="Idle" height="600px" />;
}
```

The viewer creates its own Canvas. **Do not nest it inside an existing Canvas.**

## 4. Add to an existing Three.js / React Three Fiber scene

If your existing `CosmicVoyage` already has a `<Canvas>`, import **`AnimatedCharacter`**, not `CharacterViewer`:

```jsx
import { AnimatedCharacter } from "@/components/CharacterViewer";

function YourExistingScene({ isWalking }) {
  return (
    <>
      {/* Your existing lights, water, planets and other meshes */}
      <AnimatedCharacter
        animation={isWalking ? "Walk" : "Idle"}
        position={[0, 0, 0]}
        scale={0.8}
      />
    </>
  );
}
```

You can control the state with React props (no imperative bone code needed):

```jsx
<AnimatedCharacter
  animation="Celebrate"
  modelUrl="/models/character-animated-mobile.glb"
  playing={true}
  speed={1.3}
  fadeDuration={0.25}
/>
```

All animations are looping in place. For a character walking along a path, combine the `Walk` animation with **position/rotation movement on a parent group**, controlled by your game logic. Do not assume `Walk` carries the character across the world automatically.

## Animation clips

| Clip | Duration | Behavior |
| --- | ---: | --- |
| `Idle` | 4.00 s | breathing and subtle swaying |
| `Walk` | 1.20 s | alternating leg strides and body bounce |
| `Run` | 0.78 s | faster strides and stronger bounce |
| `Hop` | 1.40 s | crouch and upward hop |
| `Dance` | 2.80 s | rhythmic head, body and legs |
| `LookAround` | 5.00 s | head scanning side to side |
| `Sleep` | 4.00 s | relaxed posture with breathing |
| `Celebrate` | 2.40 s | excited bouncing and head motion |

## Rig details and limitations

The uploaded model already included a valid 16-joint `SmartRigArmature` with weighted vertices, but no animations. The kit **preserves** the original joint hierarchy, inverse bind matrices, mesh and original UVs. It bakes new joint rotation, root translation, and body-scale tracks into standard glTF `animations`.

The movements are **procedurally authored**, not motion captured and not manually polished in Blender. They are intended as useful first-pass website/game motions. The source skeleton is a simple body/head/two-leg rig. It does **not** include facial blendshapes, independently animatable eyes, or full face controls. It is therefore not an advanced facial rig, and the clips do not contain true eye blinking, jaw/lip syncing, or finger articulation.

If you need those, a separate Blender rigging pass (eye-region topology, weights and facial morph targets) is needed. We have not silently claimed that this was done.

## Tips for mobile performance

- The model has approximately 8,228 vertices and 9,914 triangles.
- Use `character-animated-mobile.glb` for phones or multiple simultaneous characters.
- Keep pixel ratio at about 1–1.5, and avoid heavy shadows/postprocessing.
- Disable offscreen canvases or pause rendering where practical in a larger app.
- Use `SkeletonUtils.clone` for repeated instances of the same skinned GLB; plain `.clone()` can break skinned character duplication.
- Both files are self-contained GLBs, with all textures embedded.
- Characters are modeled in **Y-up**, feet near y=0, height ~1.7 scene units; forward is roughly **negative Z**.

## Validation

Source was inspected for mesh, textures, bone influences, inverse bind matrices and animation support. The resulting GLBs were structurally checked for glTF v2 container boundaries, valid skin joint indices, input/output time arrays, animation interpolation, and exact skeleton preservation.
