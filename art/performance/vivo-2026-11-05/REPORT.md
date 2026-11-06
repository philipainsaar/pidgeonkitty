# Physical phone gameplay baseline — 2026-11-05

Live URL: https://pidgeonkitty.vercel.app/
User confirmed playing before recording. Requested normal riding, jumps and wipeouts; individual events were not tagged or independently verified.

Device reports V2417, SoC SM4450, Android 16; user identifies phone as Vivo Y200. Chrome 156.0.8078.73. Physical screen 1080x2400; observed display refresh 60 Hz. MemTotal 7,638,132 kB. Phone charging during test.

## Results
- Capture window: 124 seconds (device statsStart 1793895515; statsEnd 1793895639).
- ChromeChildSurface: 3,537 frames; SurfaceFlinger averageFPS 28.814.
- Presentation histogram: median 33 ms; P90 50 ms; P99 66 ms (quantized histogram buckets, approximate).
- 602/3537 intervals (17.0%) in buckets 50 ms or longer.
- Highest occupied presentation bucket: 134 ms, 2 intervals.
- FrameTimeline jank flags: 2,677/3,536 (75.7%). This is Android's deadline classification, not a percentage of completely dropped game frames. Categories overlap and do not establish a game CPU/GPU bottleneck.
- Battery temperature: 34.0 to 35.8 degrees C. Battery 96% at both samples. Thermal status 0 at start/end; does not prove absence of throttling throughout.
- Earlier 42-second cumulative sample: 28.837 FPS, consistent with final result.

## Method and limits
ADB SurfaceFlinger timestats, isolated Chrome child surface. Statistics enabled/cleared at start and disabled after capture. Full original dumps retained alongside this report. This measures Chrome surface presentation, not JavaScript render-loop FPS or isolated GPU execution time. No screen recording was used during this capture. No visual quality settings were deliberately changed for the test.

This is a measured baseline, not full certification or a before/after optimization comparison. Loading had finished before capture; cold startup, touch latency, per-animation timings, long-session thermal behavior and energy consumption remain unmeasured. Charging prevents a useful battery-drain assessment. No code changed or deployment made during this measurement. Exact live deployed commit was not independently verified during capture.

Method reference: https://developer.android.com/games/optimize/framerate
