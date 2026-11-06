# Updated physical phone measurement

Update tested: 579a21a8c1a8cd8347fe4eed210c3846bb649fc1 (Vercel deployment successful; user confirmed reloading and playing updated live version).

| Metric | Earlier baseline | Updated run |
|---|---:|---:|
| Capture window | 124 s | 131 s |
| Chrome surface frames | 3537 | 4708 |
| SurfaceFlinger average FPS | 28.814 | 36.348 |
| Median presentation bucket | 33 ms | 33 ms |
| P90 presentation bucket | 50 ms | 33 ms |
| P99 presentation bucket | 66 ms | 50 ms |
| Intervals in 50 ms or longer buckets | 602/3537 (17.02%) | 199/4708 (4.23%) |
| Thermal status at start/end | 0 / 0 | 2 / 2 |
| Battery temperature at start | 34.0 C | 39.1 C |

Observed average FPS is 26.15% higher. Long-interval frequency is lower. These are two manually played runs, not a controlled benchmark: routes/events were not matched and the updated run was thermally throttled. Improvement cannot be attributed solely to the code change. Sustained 60 FPS has NOT been achieved or verified.

Thermal status 2 means moderate throttling per Android PowerManager documentation: https://developer.android.com/reference/android/os/PowerManager#THERMAL_STATUS_MODERATE

Histogram percentiles are approximate quantized buckets, not exact per-frame timestamps. Surface presentation measures Chrome output rather than isolated WebGL execution. Android deadline/jank categories are not proof of a specific GPU/CPU bottleneck.

Final capture was saved and the capture command included disabling timestats. The phone was disconnected when subsequently checked, so no further live data is available. End thermal dump is present; end battery temperature was not recovered and is not inferred.

The same visual assets, lighting, texture resolutions, density and renderer quality settings remain. Changes only spatially batch/cull off-camera forest/root snow and avoid sampling an unused sky texture outside the day/night blend.

Next verification: matched runs at comparable cool temperatures; deeper CPU/GPU timing is needed before selecting further changes. No claim of 60 FPS or guaranteed identical pixel output is made.
