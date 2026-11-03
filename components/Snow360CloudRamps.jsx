"use client";

import { useEffect, useMemo, useRef, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * SNOW360 PERMANENT cotton-candy sky for V58+ procedural ramps.
 * Keeps the exact collision-matched rounded ramp mesh and the existing textures.
 * All ramps anchor sparse clouds high in the sky; Super Air paths intersect the cloud layer.
 * V2: farther apart, geometry-derived AO and softly translucent view-dependent edges.
 * The four pastel cloud GLBs are built from the user's separate Cloud/Gems meshes.
 */
const FLEECE_TEXTURES = [
  "/textures/snow360-cloud-blue.jpg",
  "/textures/snow360-cloud-yellow.jpg",
  "/textures/snow360-cloud-pink.jpg",
];

const SKY_CLOUDS = [
  "/models/snow360-sky-cloud-1.glb",
  "/models/snow360-sky-cloud-2.glb",
  "/models/snow360-sky-cloud-3.glb",
  "/models/snow360-sky-cloud-4.glb",
];

const RAMP_WIDTH = 4;
const FABRIC_TILE_METERS = 4;
const BEVEL_SEGMENTS = 6;


/** The GLBs hold baked ambient-occlusion maps on their Cloud mesh only.
 * We add a soft rim opacity to THAT mesh and keep the gems/pearls opaque.
 * This avoids expensive screen-space AO, transmission, or volumetric shaders.
 * The derived material is shared between all copies of the same cloud GLB.
 */
const cloudMaterialCache = new WeakMap();
function getSoftCloudMaterial(source) {
  const cached = cloudMaterialCache.get(source);
  if (cached) return cached;
  const material = source.clone();
  material.name = "SNOW360_Cloud_SoftTransparency_BakedAO";
  material.transparent = true;
  material.opacity = 0.89;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.FrontSide;
  material.roughness = 0.99;
  material.metalness = 0;
  material.aoMapIntensity = 1.16;
  // The opaque center reads like a fluffy solid cloud, while the silhouette
  // softens toward the edge. Unlike global opacity this retains cloud volume.
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vCloudNormalView;
varying vec3 vCloudEyeView;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
       vec4 cloudViewPosition = modelViewMatrix * vec4(transformed, 1.0);
       vCloudEyeView = normalize(-cloudViewPosition.xyz);
       vCloudNormalView = normalize(normalMatrix * normal);`
    );
    shader.fragmentShader = `varying vec3 vCloudNormalView;
varying vec3 vCloudEyeView;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float cloudFacing = clamp(abs(dot(normalize(vCloudNormalView), normalize(vCloudEyeView))), 0.0, 1.0);
       float cloudEdge = smoothstep(0.065, 0.83, cloudFacing);
       diffuseColor.a *= mix(0.23, 0.96, cloudEdge);
       #include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey = () => "snow360-soft-cloud-ao-v2";
  material.needsUpdate = true;
  cloudMaterialCache.set(source, material);
  return material;
}

/** Each GLB preserves a plush Cloud mesh and separate pearly Gems meshes. */
function SkyCloudModel({ modelIndex, position, scale = 7, yaw = 0 }) {
  const {scene} = useGLTF(SKY_CLOUDS[modelIndex]);
  const cloned = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse(child => {
      if (!child.isMesh) return;
      // Do not fade the shiny pearls and stars; they stay solid and glossy.
      if (child.name === "Cloud" || child.name.startsWith("Cloud_")) {
        child.material = Array.isArray(child.material)
          ? child.material.map(getSoftCloudMaterial)
          : getSoftCloudMaterial(child.material);
      }
    });
    return copy;
  }, [scene]);
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={cloned} dispose={null} />
    </group>
  );
}

/**
 * PERMANENT SKY LAYER: the cloud models are not spawned by a trick or jump.
 * Every procedurally generated ramp permanently anchors one deterministic
 * sky tile high above the endless course, including ordinary ramps.
 * Sparse high sky clusters remain visible as the course advances. During
 * Super Air the snowboarder can intersect lower cloud masses on the jump arc.
 * We deliberately don't add colliders or touch the snowboarding physics.
 *
 * Every model includes independent "Cloud" fleece and "Gems" pearl/star
 * materials. Culling only limits expensive offscreen geometry; it never
 * changes a cloud's world position, which keeps the sky visually stable.
 */
const SKY_VISIBILITY_METERS = 215;
const SKY_VISIBILITY_DISTANCE_SQ = SKY_VISIBILITY_METERS ** 2;

// Deterministic pseudorandom values derived from the unchanging ramp row.
// This decorrelates the left/right/height pattern without shifting it at runtime.
function cloudSeed(row, salt) {
  let n = (Math.imul((row | 0) + 101, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function makeCloudLayout({index, height, length, superAir, mobile}) {
  const odd = (index % 2 === 0) ? 1 : -1;
  // V2: only TWO widely separated sky clusters per ramp span, not four.
  // With ramps about 90 m apart this leaves open sky between each cloud.
  // Their positions are deterministic and are present during ordinary riding.
  const sky = [
    {id:0, x:-27.0, y:23.0, z: 18, scale:10.8},
    {id:1, x: 26.0, y:24.5, z:-40, scale:11.5},
  ];
  // Keep two well-spaced high clouds on both screen sizes so there is never
  // an empty sky. Mobile saves meshes on the lower Super Air corridor.
  const visibleSky = sky;
  const layout = visibleSky.map(cloud => {
    const n = cloudSeed(index, cloud.id);
    return {
      id:`sky-${cloud.id}`,
      i:(cloud.id + Math.floor(index / 15)) % 4,
      // Narrow mobile FOV needs sky clouds closer to the course center.
      x:odd * (cloud.x * (mobile ? 0.64 : 1) + (n - .5) * 9.0),
      y:cloud.y + (cloudSeed(index, cloud.id + 22) - .5) * 5.5,
      z:cloud.z + (cloudSeed(index, cloud.id + 36) - .5) * 13.0,
      scale:cloud.scale * (.90 + n * .17),
      yaw:odd * (-.38 + n * .76),
    };
  });
  if (!superAir) return layout;

  // V2: just two spaced cloud masses near the real Super Air flight arc.
  // They exist ALL THE TIME in world space, even before takeoff. At high
  // speed the rider can pass through them around the ascent and apex.
  // The open 40 m gap avoids turning the flight path into a cloud tunnel.
  const passage = [
    {id:0, x:-2.7, y:height+10.4, z:-length/2-22, scale:8.6},
    {id:1, x: 2.8, y:height+18.2, z:-length/2-63, scale:10.0},
  ];
  const visiblePassage = mobile ? [passage[1]] : passage;
  for (const cloud of visiblePassage) {
    const n = cloudSeed(index, cloud.id + 71);
    layout.push({
      id:`air-${cloud.id}`,
      i:(cloud.id + index + 1) % 4,
      x:odd * (cloud.x + (n - .5) * 3.0),
      y:cloud.y + (cloudSeed(index, cloud.id + 89) - .5) * 3.4,
      z:cloud.z + (cloudSeed(index, cloud.id + 119) - .5) * 4.0,
      scale:cloud.scale * (.93 + n * .14),
      yaw:odd * (-.46 + n * .92),
    });
  }
  return layout;
}

function PermanentSkyClouds({x, z, groundHeight, height, length, index, superAir}) {
  const root = useRef();
  const worldAnchor = useMemo(() => new THREE.Vector3(), []);
  const mobile = useThree(({size}) => size.width < 720);
  const layout = useMemo(
    () => makeCloudLayout({index,height,length,superAir,mobile}),
    [index,height,length,superAir,mobile],
  );
  useFrame(({clock, camera}) => {
    if (!root.current) return;
    root.current.getWorldPosition(worldAnchor);
    root.current.visible = camera.position.distanceToSquared(worldAnchor) < SKY_VISIBILITY_DISTANCE_SQ;
    if (root.current.visible) {
      // All clouds drift gently, but never travel with the snowboarder.
      // The same world-space layout is always there, jump or no jump.
      root.current.position.y = groundHeight + Math.sin(clock.elapsedTime*.30+index*.19)*.17;
    }
  });
  return <group ref={root} position={[x, groundHeight, z]}>
    {layout.map((cloud) => <SkyCloudModel key={cloud.id}
      modelIndex={cloud.i} position={[cloud.x,cloud.y,cloud.z]}
      scale={cloud.scale} yaw={cloud.yaw} />)}
  </group>;
}

/** The profile runs from entry (0, 0) to the high lip (length, height). */
function roundedWedgeShape(length, height, cornerCut) {
  const vertices = [[0, 0], [length, 0], [length, height]];
  const corners = vertices.map((v, i) => {
    const prev = vertices[(i + 2) % 3];
    const next = vertices[(i + 1) % 3];
    const along = p => {
      const dx = p[0] - v[0], dy = p[1] - v[1];
      const factor = cornerCut / Math.max(0.0001, Math.hypot(dx, dy));
      return [v[0] + dx * factor, v[1] + dy * factor];
    };
    return {before: along(prev), after: along(next)};
  });

  const shape = new THREE.Shape();
  shape.moveTo(...corners[0].after);
  for (let i = 1; i < 3; i++) {
    shape.lineTo(...corners[i].before);
    shape.quadraticCurveTo(...vertices[i], ...corners[i].after);
  }
  shape.lineTo(...corners[0].before);
  shape.quadraticCurveTo(...vertices[0], ...corners[0].after);
  shape.closePath();
  return shape;
}

function makeRoundedRampGeometry(rawHeight, rawLength, superAir) {
  const h = Math.max(0.1, rawHeight);
  const length = Math.max(0.5, rawLength);
  const round = Math.min(superAir ? 0.19 : 0.13, h * 0.17, length * 0.055);
  const bevelThickness = round;
  const bevelSize = round * 0.35;
  const cornerCut = Math.min(round * 1.4, h * 0.17, length * 0.05);
  const shape = roundedWedgeShape(length, h, cornerCut);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: RAMP_WIDTH - 2 * bevelThickness,
    steps: 1,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: BEVEL_SEGMENTS,
    curveSegments: 7,
  });

  // Remap (forward, up, width) to world (X, Y, Z).
  // Deck remains flat in X and linearly inclined from +Z entry to -Z lip.
  const positions = geometry.getAttribute("position");
  const original = new Float32Array(positions.array);
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(i,
      original[i * 3 + 2] - RAMP_WIDTH * 0.5 + bevelThickness,
      original[i * 3 + 1],
      length * 0.5 - original[i * 3]);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const isCap = new Uint8Array(positions.count);
  for (const group of geometry.groups) {
    if (group.materialIndex === 0) {
      for (let i = group.start; i < group.start + group.count; i++) isCap[i] = 1;
    }
  }
  const normals = geometry.getAttribute("normal");
  const uv = new Float32Array(positions.count * 2);
  const tile = FABRIC_TILE_METERS;
  const slopeScale = Math.hypot(length, h) / length;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const forward = length * 0.5 - z;
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    let u, v;
    if (isCap[i] || Math.abs(nx) > 0.75) {
      u = forward / tile;
      v = y / tile;
    } else if (ny > 0.20) {
      u = (x + RAMP_WIDTH / 2) / tile;
      v = forward * slopeScale / tile;
    } else if (nz < -0.20) {
      u = (x + RAMP_WIDTH / 2) / tile;
      v = y / tile;
    } else {
      u = (x + RAMP_WIDTH / 2) / tile;
      v = forward / tile;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export default function Snow360CloudRamp({
  x, z, index = 0, height = 1.12, length = 3,
  superAir = false, variant, groundHeight = 0,
}) {
  const ordinaryVariant = variant === undefined ? index % 2 : variant;
  const styleIndex = superAir ? 2 : ordinaryVariant === 1 ? 1 : 0;
  const texture = useTexture(FLEECE_TEXTURES[styleIndex]);
  const geometry = useMemo(
    () => makeRoundedRampGeometry(height, length, superAir),
    [height, length, superAir],
  );

  useEffect(() => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const trimColor = styleIndex === 2 ? "#ffd4ee" : styleIndex === 1 ? "#fff3ce" : "#daf1ff";
  return (
    <>
      <group position={[x, groundHeight, z]}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial map={texture} color="#ffffff" roughness={0.98}
            metalness={0} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, height + 0.012, -length * 0.5 + 0.035]}
          rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.038, RAMP_WIDTH - 0.24, 4, 8]} />
          <meshStandardMaterial color={trimColor} roughness={1} metalness={0} />
        </mesh>
      </group>
      <Suspense fallback={null}>
        <PermanentSkyClouds x={x} z={z} index={index} groundHeight={groundHeight}
          height={height} length={length} superAir={superAir} />
      </Suspense>
    </>
  );
}
