import { FrontSide, MeshBasicMaterial, MeshLambertMaterial } from "three";

export const DIAGNOSTIC_SECONDS = 120;
const variants = ["baseline", "no-star-glow", "baseline", "no-star-shell", "baseline", "no-trees", "baseline", "unlit-materials"];
const treeVariants = ["baseline", "tree-diffuse", "baseline", "tree-front-faces", "baseline", "tree-unlit"];
export function diagnosticWindow(activeMs, mode = "1") {
  const sequence = mode === "trees" ? treeVariants : variants;
  return { variant: sequence[Math.floor(activeMs / 3000) % sequence.length], settled: activeMs % 3000 >= 500 };
}

// Diagnostic-only substitutions, restored immediately after each render.
export function createRenderDiagnostics() {
  const materials = new Map();
  const treeMaterials = new Map();
  function treeMaterial(source, variant) {
    if (!source?.isMeshStandardMaterial) return source;
    let cache = treeMaterials.get(source);
    if (!cache) { cache = new Map(); treeMaterials.set(source, cache); }
    if (!cache.has(variant)) {
      let material;
      if (variant === "tree-front-faces") { material = source.clone(); material.side = FrontSide; }
      else {
        const Type = variant === "tree-diffuse" ? MeshLambertMaterial : MeshBasicMaterial;
        material = new Type({ color: source.color, map: source.map, alphaMap: source.alphaMap,
          transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
          side: source.side, depthWrite: source.depthWrite, depthTest: source.depthTest,
          vertexColors: source.vertexColors, fog: source.fog, toneMapped: source.toneMapped });
      }
      cache.set(variant, material);
    }
    return cache.get(variant);
  }
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
        if (variant.startsWith("tree-") && object.isMesh) {
          let parent = object.parent;
          while (parent && parent.name !== "Snow360Trees") parent = parent.parent;
          if (parent) {
            const value=object.material;
            object.material=Array.isArray(value)?value.map(m=>treeMaterial(m,variant)):treeMaterial(value,variant);
            restore.push(()=>{object.material=value;});
          }
        }
      });
      return () => { for (let i=restore.length-1;i>=0;i--) restore[i](); };
    },
    dispose() { for (const material of materials.values()) material.dispose(); materials.clear();
      for (const cache of treeMaterials.values()) for (const material of cache.values()) material.dispose();
      treeMaterials.clear(); },
  };
}
