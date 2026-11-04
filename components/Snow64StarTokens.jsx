"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * SNOW360 V73: shiny YELLOW-ONLY holographic five-point stars.
 * One draw call per course chunk. Uses exactly the old token world positions,
 * rotation rate (2.3 rad/s), and bob (sin(time*4+z)*0.14).
 * Collection is still decided by SnowboardGame collision/scoring code.
 */

/**
 * Interference and reflected light stay strictly in the yellow family.
 * The different tones are warm honey, lemon, butter and champagne.
 */
const YELLOW_STAR_FILM_GLSL = [
  "vec3 yellowHoney=vec3(0.96,0.68,0.12);",
  "vec3 yellowButter=vec3(1.00,0.84,0.25);",
  "vec3 yellowLemon=vec3(1.00,0.97,0.48);",
  "vec3 yellowPearl=vec3(1.00,0.995,0.72);",
  "vec3 yellowChampagne=vec3(0.995,0.89,0.38);",
  "float angleView=abs(dot(normalize(vStarNormalView),normalize(-vStarPositionView)));",
  "float rim=pow(1.0-clamp(angleView,0.0,1.0),2.25);",
  "float phaseA=sin(vStarLocalXY.x*10.0+vStarLocalXY.y*4.5+uStarHoloTime*1.25);",
  "float phaseB=sin(vStarLocalXY.y*13.0-vStarLocalXY.x*3.7-uStarHoloTime*0.78);",
  "float interference=clamp(0.50+0.34*phaseA+0.16*phaseB,0.0,1.0);",
  "vec3 yellowFilm=mix(yellowHoney,yellowButter,interference);",
  "yellowFilm=mix(yellowFilm,yellowLemon,0.5+0.5*sin(uStarHoloTime*.60+vStarLocalXY.x*5.5));",
  "yellowFilm=mix(yellowFilm,yellowChampagne,0.14);",
  "float glint=pow(0.5+0.5*sin(vStarLocalXY.y*14.0-vStarLocalXY.x*7.0+uStarHoloTime*1.70),12.0);",
  "yellowFilm=mix(yellowFilm,yellowPearl,glint*0.88);",
  "float yellowWeight=clamp(0.33+0.30*rim+0.27*glint,0.0,0.87);",
  "diffuseColor.rgb=mix(diffuseColor.rgb,yellowFilm,yellowWeight);",
  "diffuseColor.rgb+=vec3(0.045,0.033,0.003)*glint;"
].join("\n");

function makeRoundedStarGeometry() {
  const pts = [];
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1.0 : 0.54;
    const a = Math.PI * 0.5 + i * Math.PI / spikes;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape();
  const corner = 0.19;
  const count = pts.length;
  const before = (i) => pts[i].clone().lerp(pts[(i + count - 1) % count], corner);
  const after = (i) => pts[i].clone().lerp(pts[(i + 1) % count], corner);
  const first = before(0);
  shape.moveTo(first.x, first.y);
  for (let i = 0; i < count; i++) {
    const a = before(i);
    const b = after(i);
    shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(pts[i].x, pts[i].y, b.x, b.y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.29,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.13,
    bevelSegments: 5,
    curveSegments: 6,
  });
  geometry.center();
  // Leave star upright on XY, front/back normals point along Z.
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * @param items original chunk coins, each with {id,x,z}
 * @param groundY same physical snow surface function used for collisions
 * @param collectedRef game Set of collected token IDs (optional in intro)
 * @param preview if true, tokens in the intro remain visible and rotate
 */
export default function Snow64StarTokens({
  items = [],
  groundY,
  collectedRef,
  preview = false,
}) {
  const mesh = useRef(null);
  const starShader = useRef(null);
  const geometry = useMemo(makeRoundedStarGeometry, []);
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      name: "SNOW360_YellowHolographicStar_V73",
      color: "#ffe36b",
      roughness: 0.19,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.09,
      emissive: "#8c650c",
      emissiveIntensity: 0.17,
      side: THREE.DoubleSide,
    });

    m.onBeforeCompile = (shader) => {
      starShader.current = shader;
      shader.uniforms.uStarHoloTime = { value: 0 };

      shader.vertexShader = [
        "varying vec2 vStarLocalXY;",
        "varying vec3 vStarNormalView;",
        "varying vec3 vStarPositionView;"
      ].join("\n") + "\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vStarLocalXY=position.xy;"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <defaultnormal_vertex>",
        "#include <defaultnormal_vertex>\n vStarNormalView=normalize(transformedNormal);"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n vStarPositionView=mvPosition.xyz;"
      );
      shader.fragmentShader = [
        "uniform float uStarHoloTime;",
        "varying vec2 vStarLocalXY;",
        "varying vec3 vStarNormalView;",
        "varying vec3 vStarPositionView;"
      ].join("\n") + "\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" + YELLOW_STAR_FILM_GLSL
      );
    };
    m.customProgramCacheKey = () => "snow360-v73-yellow-only-holographic-star";
    return m;
  }, []);
  const scratch = useMemo(() => ({
    object: new THREE.Object3D(),
    scale: 0.48,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const t = clock.elapsedTime;
    if (starShader.current?.uniforms?.uStarHoloTime) {
      starShader.current.uniforms.uStarHoloTime.value = t;
    }
    const dummy = scratch.object;
    for (let i = 0; i < items.length; i++) {
      const coin = items[i];
      const hidden = !preview && !!collectedRef?.current?.has(coin.id);
      dummy.position.set(
        coin.x,
        groundY(coin.x, coin.z) + 1.3 + Math.sin(t * 4 + coin.z) * 0.14,
        coin.z
      );
      dummy.rotation.set(0, t * 2.3, 0);
      dummy.scale.setScalar(hidden ? 0.000001 : scratch.scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, items.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  );
}
