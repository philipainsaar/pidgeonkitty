# Cooler-phone retest

User confirmed reloading and playing updated game. SurfaceFlinger ChromeChildSurface capture: 206 seconds, device timestamps 1793914752–1793914958. Average presentation FPS 37.016; 7,501 histogram intervals. Approximate P90 bucket 33 ms, P99 bucket 50 ms. Intervals >=50 ms: 334 (4.45%).

Battery temperature at capture start/end: 32.0 / 34.1 C. Pre-launch temperature was 30.9 C. Thermal status 0 at start, intermediate check, and end. Statistics disabled after final dump.

Comparison: original baseline 28.814 FPS, hot updated run 36.348 FPS, cooler updated run 37.016 FPS. Cooler updated result is 28.5% above original observed FPS, but routes/events were manually played and unmatched, so this is not an isolated causal benchmark. The similar updated runs suggest heat alone does not explain the remaining shortfall. No claim of GPU versus CPU bottleneck can be established from these presentation statistics.

No graphics settings, source code or deployment were changed during this retest. Sustained 60 FPS is not achieved. Next step requires per-frame CPU/GPU profiling to target remaining rendering cost without reducing appearance.
