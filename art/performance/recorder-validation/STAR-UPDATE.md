# Star instance optimization — 2026-11-06

Phone baseline is saved in ../vivo-profile.json: 60 seconds active gameplay. Median CPU render submission 6.5 ms; animation 0.1 ms; 736,768 triangles. GPU timer unavailable on phone.

Commit da641a4 compacts fully rewritten star body, shell, glow and ring instances before renderer object processing. Collected and out-of-frustum instances are skipped. Particle buffers are unchanged. Conservative bounding spheres include shell displacement. Original drawing can be compared after recording using the profiler button.

14 tests and production build pass. Desktop runs used different viewport sizes, so timing and triangle differences do not establish a controlled speedup. The optimized desktop run completed. Earlier buffer-resize errors were present in the browser log; none were added during the subsequent reloaded full run. Mobile retest is still required, including checking rendering errors and visual continuity.

Phone disconnected at follow-up. No 60 FPS result claimed.
