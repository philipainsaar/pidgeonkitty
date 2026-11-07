"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Snow360 Ice-cream Power | SINGLE-BUBBLE FIX.
 *
 * The prior version stacked a billboard halo, a glass sphere and a hover ring.
 * In the brightly lit snowy course, those looked like multiple white bubbles.
 *
 * This component renders EXACTLY ONE bubble: one Fresnel-shaded sphere.
 * No sprite, back shell, ground torus, extra orb, opaque glass or lights.
 * The center is transparent so the PBR ice-cream GLB remains fully visible.
 *
 * Drop-in replacement for components/Snow64IcecreamPowerAura.jsx.
 * No changes to IcecreamPower.glb, SnowboardGame.jsx or power-up rules.
 */

function createSingleBubbleMaterial(mobile) {
  return new THREE.ShaderMaterial({
    name: "IcecreamPower_SINGLE_ClearPastelBubble",
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: mobile ? 0.69 : 0.77 },
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vToCamera;
      varying vec3 vLocalPosition;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vToCamera = normalize(-p.xyz);
        vLocalPosition = position;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vViewNormal;
      varying vec3 vToCamera;
      varying vec3 vLocalPosition;
      void main() {
        // One continuous Fresnel rim: no second ring, no center shading.
        float facing = abs(dot(normalize(vViewNormal), normalize(vToCamera)));
        float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.1);
        if (rim < 0.015) discard;

        // Soft animated candy reflections, kept saturated instead of white.
        float wave = 0.5 + 0.5 * sin(uTime * 0.58 + vLocalPosition.y * 3.7
                                      + vLocalPosition.x * 1.9);
        vec3 pink = vec3(1.0, 0.40, 0.77);
        vec3 lilac = vec3(0.73, 0.55, 1.0);
        vec3 mint = vec3(0.48, 0.92, 0.94);
        vec3 tint = mix(pink, lilac, wave * 0.60);
        tint = mix(tint, mint, (0.5 + 0.5 * sin(uTime * 0.43 + vLocalPosition.y * 4.0)) * 0.17);

        float pulse = 0.95 + 0.05 * sin(uTime * 2.0);
        float alpha = clamp(rim * uOpacity * pulse, 0.0, 0.80);
        gl_FragColor = vec4(tint, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}

export default function Snow64IcecreamPowerAura({ mobile = false }) {
  const bubbleMaterial = useMemo(() => createSingleBubbleMaterial(mobile), [mobile]);

  useFrame(({ clock }) => {
    bubbleMaterial.uniforms.uTime.value = clock.elapsedTime;
  });

  useEffect(() => () => bubbleMaterial.dispose(), [bubbleMaterial]);

  // Fits around the 2.10-unit-tall IcecreamPower.glb placed at y=-0.38.
  // Keep ONE geometry / ONE material / ONE shell only.
  return (
    <group name="IcecreamPower_OneClearGlowingBubble">
      <mesh
        name="IcecreamPower_SingleBubble"
        position={[0, 0.66, 0]}
        scale={[1.48, 1.52, 1.48]}
        material={bubbleMaterial}
        renderOrder={3}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, mobile ? 24 : 32, mobile ? 16 : 24]} />
      </mesh>
    </group>
  );
}
