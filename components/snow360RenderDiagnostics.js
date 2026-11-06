import { MeshBasicMaterial } from "three";

export const DIAGNOSTIC_SECONDS = 120;
const variants = ["baseline", "no-star-glow", "baseline", "no-star-shell", "baseline", "no-trees", "baseline", "unlit-materials"];
export function diagnosticWindow(activeMs) {
  return { variant: variants[Math.floor(activeMs / 3000) % variants.length], settled: activeMs % 3000 >= 500 };
}

// Diagnostic-only substitutions, restored immediately after each render.
export function createRenderDiagnostics() {
  const materials = new Map();
  function unlit(source) {
    if (!source || !(source.isMeshStandardMaterial || source.isMeshPhongMaterial || source.isMeshLambertMaterial)) return source;
    if (!materials.has(source)) {
      const material = new MeshBasicMaterial({
        color: source.color, map: source.map, alphaMap: source.alphaMap,
        transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
        side: source.side, depthWrite: source.depthWrite, depthTest: source.depthTest,
        vertexColors: source.vertexColors, fog: source.fog, toneMapped: source.toneMapped,
      });
      materials.set(source, material);
    }
    return materials.get(source);
  }
  return {
    apply(scene, variant) {
      const restore = [];
      // Traverse on every variant, including baseline, for comparable instrumentation overhead.
      scene.traverse(object => {
        const hide = (variant === "no-star-glow" && object.name === "Snow360StarGlow") ||
          (variant === "no-star-shell" && object.name === "Snow360StarShell") ||
          (variant === "no-trees" && object.name === "Snow360Trees");
        if (hide) { const value=object.visible; restore.push(()=>{object.visible=value;}); object.visible=false; }
        if (variant === "unlit-materials" && object.isMesh) {
          const value=object.material;
          const replacement=Array.isArray(value)?value.map(unlit):unlit(value);
          if (replacement !== value) { restore.push(()=>{object.material=value;}); object.material=replacement; }
        }
      });
      return () => { for (let i=restore.length-1;i>=0;i--) restore[i](); };
    },
    dispose() { for (const material of materials.values()) material.dispose(); materials.clear(); },
  };
}
