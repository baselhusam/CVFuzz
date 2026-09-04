# The Last Known Frame

Five eight-second cinematic sections designed as first/last-frame inputs for Google Flow and
Veo 3. The complete sequence runs for 40 seconds.

## Keyframe map

| Clip | Start | End | Motion intent |
| --- | --- | --- | --- |
| 01 — Acquisition | `keyframes/clip-01-start.png` | `keyframes/clip-01-end.png` | Push from distant headlights to a clean tracking lock. |
| 02 — Pursuit | `keyframes/clip-02-start.png` | `keyframes/clip-02-end.png` | Track laterally as the car outruns its bounding box. |
| 03 — Degradation | `keyframes/clip-03-start.png` | `keyframes/clip-03-end.png` | Follow from behind as fog, glare, and a false detection appear. |
| 04 — Lost | `keyframes/clip-04-start.png` | `keyframes/clip-04-end.png` | Follow the car into the tunnel until only failed tracking remains. |
| 05 — Reconstruction | `keyframes/clip-05-start.png` | `keyframes/clip-05-end.png` | Dissolve the failed rectangle into particles that construct the logo. |

`clip-04-end.png` and `clip-05-start.png` intentionally contain the same frame for a seamless
handoff. `keyframes/contact-sheet.png` previews the complete sequence.

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
