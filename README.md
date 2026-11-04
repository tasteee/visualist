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

The wordmark is used as image layers from `src/assets/logo-layers/`:
core, fringeA, fringeB, sil, outline, halo (white alpha masks, tinted at
draw time), bg.jpg (the faint lyric pattern, turned into a mask) and
layout.json (pivot and size). It is never retyped in a font.

## Keys

| Key | Action |
| --- | --- |
| Space | Play / pause (not while typing) |
| Home | Back to start |
| `=` / `-` | Zoom in / out around the playhead |
| `0` | Zoom to fit the whole song |
| F | Follow the playhead while playing |
| S | Snap points to the beat grid (hold Shift to move freely) |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo / redo automation edits |
| Left / Right on the waveform | Seek 5 s |

## Timeline

- Ctrl/Cmd + wheel or pinch zooms anywhere. Plain wheel zooms over
  the ruler, waveform and overview, and scrolls the lanes elsewhere.
- Shift + wheel or a sideways swipe scrolls left and right.
- Drag the ruler up and down to zoom, left and right to scroll,
  click it to seek. The bar along its top is the export range.
- The overview at the bottom shows the whole song: drag the window
  to scroll, drag its edges to zoom, double-click to fit.
- Drag the grip above the editor to resize it. The video keeps its
  16:9 frame in the space left over.

Spec: product spec for the tasteink visualizer (behavior only).
