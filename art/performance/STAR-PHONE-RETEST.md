# Vivo star optimization retest — 2026-11-06

Deployed commit: da641a43c6289a74e31e23b283943dd577453931.
Both in-game reports contain 60 seconds active gameplay at 432 × 813, pixel ratio 1.1. Updated report label verified as visible-star-instances. GPU timing unavailable.

| Median metric | Previous | Updated |
| --- | ---: | ---: |
| Triangles/frame | 736768 | 609566 |
| Draw calls/frame | 149 | 126 |
| CPU render submission | 6.5 ms | 6.2 ms |
| Frame callback work | 0.9 ms | 0.8 ms |
| Animation work | 0.1 ms | 0.1 ms |
| Browser frame interval | 30.7 ms | 31.7 ms |

P95 browser interval: 40.5 → 38.1 ms. P95 CPU render submission: 12.6 → 13.0 ms. Results are mixed for timing despite clear drawing-work reductions; they do not prove a uniform speedup.

Separate SurfaceFlinger capture: 100 seconds, ChromeChildSurface average presentation FPS 38.497. 106/3788 (2.80%) presentation intervals were >=50 ms. Previous cooler-run presentation FPS was 37.016 with 4.45% >=50 ms. These are manually played, unmatched runs and separate windows from the in-game reports; do not equate presentation FPS with JavaScript frame cadence or claim a controlled causal gain.

Battery temperature start/end: 32.5 / 34.1 C. Thermal status 0 at both checks. Recording disabled after capture. Sustained 60 FPS not achieved. Rendering remains the next investigation target; unavailable GPU timings prevent separating shader/fill cost from driver waiting using these reports alone.

Raw data: vivo-profile.json, vivo-profile-optimized.json, star-phone-early.txt, star-phone-final.txt. Kept local, not committed.
