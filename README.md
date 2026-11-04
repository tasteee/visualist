# vink

The tasteink visualizer. Load a finished song, tune the look, and record
a 16:9 video ready for YouTube. The logo pulses, glitches and reacts to
the real audio (bass, mids, highs, kicks, snares, energy and tempo), can
be taken over by spreading ink, and carries the track title.

Runs entirely in the browser. No backend, no accounts, works offline.

```sh
pnpm dev:vink     # from the repo root, http://localhost:5179
pnpm build:vink
```

## Stack

- **Svelte 5 + Vite**, no SvelteKit. State lives in runes (`src/store.svelte.ts`).
- **@tasteee/zest** for every control: tabs, sliders, switches, color
  pickers, number inputs, tooltips, toasts, progress and buttons.
- **Canvas 2D** for the picture. **Web Audio** for playback and analysis.
  **MediaRecorder** for export (MP4 when the browser can, else WebM).

## How it works

```
src/
  engine/   no UI. Pure functions of time + settings
    analysis.ts    decode -> bands, hits, energy, tempo, beat grid (10 ms grid)
    logoLayers.ts  splits the logo raster into masks, tints and distresses them
    echoes.ts      which echoes exist at time t, and how they look
    ink.ts         the spreading ink blob
    render.ts      one frame, back to front
    audio.ts       the audio clock (visuals follow it, never drift)
    recorder.ts    format pick + MediaRecorder
  store.svelte.ts  app state, render loop, load / play / seek / record
  ui/              zest-based interface
```

Every frame is a pure function of playback time and settings, so preview,
scrubbing and recording draw identical frames. All randomness is seeded
from time, stepped at 14 flickers per second.

## The logo

Drop `logo.png` (or `.webp` / `.jpg`) into `src/assets/`. The layers (core,
two glitch fringes, silhouette, outline, halo) are split out at load time
by color: near-black core, magenta and cyan fringes, light paper.

Without a file, a wordmark is generated in the same colors and goes through
the same pipeline, so the app always runs.

## Keys

| Key | Action |
| --- | --- |
| Space | Play / pause (not while typing) |
| Left / Right on the timeline | Seek 5 s |

Spec: product spec for the tasteink visualizer (behavior only).
