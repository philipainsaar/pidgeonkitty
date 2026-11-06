# Vivo tree-material trial — 2026-11-06

72.007 seconds active gameplay; 432 × 813, GPU timer unavailable. First 500 ms of each three-second segment excluded.

| Trial | Settled frames | Median interval ms | Mean interval ms | P95 ms |
|---|---:|---:|---:|---:|
| baseline | 1022 | 31.8 | 29.34 | 49.3 |
| tree-diffuse | 365 | 23.4 | 27.37 | 42.9 |
| tree-front-faces | 390 | 26.85 | 25.65 | 37.9 |
| tree-unlit | 396 | 20.6 | 25.19 | 42 |

These are browser frame intervals, not measured physical display FPS. Course positions and CPU/GPU work vary between interleaved segments. The mean diffuse improvement is smaller than the median suggests. None establishes sustained 60 FPS.

Unlit trees remove lighting and are unsuitable as a default without appearance reconstruction. Front-face-only trees need visual/geometry validation because the source assets have open boundary edges. Diffuse lighting is a potential compromise but requires side-by-side appearance validation. Production materials remain unchanged.
