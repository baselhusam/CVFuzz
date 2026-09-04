# The Last Known Frame

Five sequential eight-second cinematic sections designed as first/last-frame inputs for Google
Flow and Veo 3. The complete sequence runs for 40 seconds and uses six unique boundary images:

```text
Clip 01: A -> B
Clip 02: B -> C
Clip 03: C -> D
Clip 04: D -> E
Clip 05: E -> F
```

## Keyframe map

| Clip | Start | End | Motion intent |
| --- | --- | --- | --- |
| 01 — Acquisition | `keyframes/clip-01-start.png` | `keyframes/clip-01-end.png` | Push from distant headlights to a clean tracking lock. |
| 02 — Pursuit | `keyframes/clip-02-start.png` | `keyframes/clip-02-end.png` | Let the car pass camera, then whip-pan into a lateral track as it outruns the box. |
| 03 — Degradation | `keyframes/clip-03-start.png` | `keyframes/clip-03-end.png` | Orbit behind the car as fog, glare, and a false detection appear. |
| 04 — Lost | `keyframes/clip-04-start.png` | `keyframes/clip-04-end.png` | Pull wider as a tunnel emerges from the fog and the car disappears into it. |
| 05 — Reconstruction | `keyframes/clip-05-start.png` | `keyframes/clip-05-end.png` | Dissolve the failed rectangle into particles that construct the logo. |

Every clip end and following clip start are intentionally byte-identical for seamless Flow
handoffs. `keyframes/contact-sheet.png` previews the complete sequence.

## Visual constants

- Format: 16:9 landscape, 1672 × 941 pixels
- Ink: `#0B0E12`
- Signal: `#D7FA03`
- Paper: `#F7F9F2`
- Slate: `#69737F`
- Failure: `#F45B69`
- Vehicle: unbranded black four-door luxury performance sedan
- Environment: rain, wet asphalt, realistic fog, premium neo-noir cinematography

The final frame composites the approved `brand/logos/cvfuzz-logo-dark.png` master without
redrawing or recoloring it.
