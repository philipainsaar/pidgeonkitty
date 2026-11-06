# Vivo rendering isolation — 2026-11-06

120 seconds, 432 × 813, pixel ratio 1.1. GPU timer unavailable. Values below are medians of settled frames, not display FPS.

| Trial | Frames | Interval ms | CPU submission ms | Triangles | Calls |
|---|---:|---:|---:|---:|---:|
| baseline | 1928 | 27.6 | 6.8 | 615708.0 | 126.0 |
| no-star-glow | 482 | 28.3 | 6.7 | 612317.0 | 124.0 |
| no-star-shell | 481 | 28.9 | 6.7 | 595967 | 123 |
| no-trees | 639 | 16.7 | 5.7 | 398548 | 84 |
| unlit-materials | 685 | 16.7 | 5.4 | 613877 | 126 |

Strongest signals: scene lighting/materials and tree rendering. No clear gain from removing star glow/shell. Interleaved trials use different course positions and asynchronous CPU/GPU work; results guide further tests, not a claim of sustained 60 FPS.
Tree source GLBs all use double-sided Standard PBR with a base-color texture, metalness 0, default roughness 1. Welded topology scan found 3–5 boundary edges per tree and no nonmanifold/same-direction edge pairs. Front-side-only rendering is experimental until visuals are checked.
Next: isolate tree-only diffuse, unlit and front-face candidates; production appearance remains unchanged.