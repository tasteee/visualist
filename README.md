# vink

The tasteink visualizer. Load a finished song, tune the look, and record
a video for YouTube, TikTok, Reels, Shorts or the Instagram and
Facebook feeds. The logo pulses, glitches and reacts to
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
    formats.ts     frame shapes (16:9, 9:16, 1:1, 4:5) and output sizes
    layers.ts      layer model: defaults, params, FX list, blend modes
    layerRender.ts draws the layer stack, with transforms, blends and FX
    assets.ts      image and SVG files: decoded for drawing, kept in IndexedDB
    modulation.ts  mod sources (bass, kick, beat...) and how they push values
    post.ts        WebGL finishing pass: bloom, aberration, warp, film
    logoLayers.ts  splits the logo raster into masks, tints and distresses them
    echoes.ts      which echoes exist at time t, and how they look
    render.ts      one frame, back to front
    audio.ts       the audio clock (visuals follow it, never drift)
    recorder.ts    format pick + MediaRecorder
  store.svelte.ts  app state, render loop, load / play / seek / record
  layers.svelte.ts layer list, selection, add / remove / reorder, saving
  ui/              zest-based interface
```

Every frame is a pure function of playback time and settings, so preview,
scrubbing and recording draw identical frames. All randomness is seeded
from time, stepped at 14 flickers per second.

## Formats

| Format | Ratio | 1080 export | For |
| --- | --- | --- | --- |
| Landscape | 16:9 | 1920 × 1080 | YouTube, Facebook, X |
| Vertical | 9:16 | 1080 × 1920 | TikTok, Reels, Shorts, Stories |
| Square | 1:1 | 1080 × 1080 | Instagram and Facebook feed |
| Portrait | 4:5 | 1080 × 1350 | Instagram and Facebook feed |

The scene is designed at 16:9. Other shapes fill the whole frame
with the background, lyric pattern and grain, and scale the logo,
echoes and title down around the center until they fit the width.

## Layers

The frame is a stack, drawn back to front over the background:

- **Logo scene**: the built-in echoes, grain, logo and title. Always
  present, can be hidden, moved, blended and given FX like any layer.
- **Text**: DM Sans, Regular / Bold / Black, optional uppercase, colored
  from the palette so it follows theme changes.
- **Image**: PNG, JPG, WebP, GIF or AVIF.
- **Vector**: SVG, kept in its own colors or tinted from the palette.

Every layer has position (percent of the frame, so it survives format
changes), scale, rotation, opacity, a blend mode and a start and end
time with a short fade at each edge. Layers and their settings are
saved in localStorage. Image and SVG files are saved in IndexedDB.

Frame flow:

```
time -> signals -> settings (lanes, then mods)
     -> background -> each layer: resolve params -> FX -> blend
     -> WebGL post (only when a post slider is above 0)
     -> video fade -> canvas -> recorder
```

## Modulation

Hover any slider and click the wave icon to make it follow the music.

| Source | Moves on |
| --- | --- |
| Bass, Mids, Highs, Energy | the band level right now |
| Kick, Snare | each hit, fading out over about 0.15 s |
| Every beat | a sharp pulse on each beat of the grid |
| Every bar | a slow swell once per 4 beats |

Depth runs from -100% to +100% of the control's range. Mods add on top
of the base value, or on top of the automation lane when there is one.
The thin bar under a modulated slider shows its value at the playhead.

## Layer effects

Glow, color split, glitch, shake, flicker and blur. Each has one
amount, and each amount can be modulated. Glow and blur are painted
at reduced size, then scaled up, which keeps them cheap.

## Post

A WebGL pass over the finished frame: bloom, chromatic aberration,
warp, scanlines, film noise and vignette. Bloom comes from saturated
accents in light mode, and from anything bright in dark mode. Post
sliders can be automated and modulated like any other control. If
WebGL is unavailable, post turns off and everything else still works.

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
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo / redo lanes, clip timing and layer order |
| Left / Right on the waveform | Seek 5 s |

## Timeline

- Ctrl/Cmd + wheel or pinch zooms anywhere. Plain wheel zooms over
  the ruler, waveform and overview, and scrolls the lanes elsewhere.
- Shift + wheel or a sideways swipe scrolls left and right.
- Drag the ruler up and down to zoom, left and right to scroll,
  click it to seek. The bar along its top is the export range.
- The overview at the bottom shows the whole song: drag the window
  to scroll, drag its edges to zoom, double-click to fit.
- Lanes are grouped: **Scene and post** for the global controls,
  then one group per layer, front to back. Click a group's caret to
  fold its lanes, and its + to automate another of its controls.
- Each layer's header row holds its **clip bar**: drag the body to
  move when the layer shows, drag an edge to trim it, double-click to
  fill the whole song. Arrow keys nudge it, Shift+arrows trim the end.
- Drag a layer by its name to reorder the stack; a line shows where it
  lands. Alt+Up and Alt+Down do the same from the keyboard.
- Undo and redo cover lane edits, clip moves and trims, and layer
  reordering, all on one history.
- Clicking a layer's header, bar or lanes opens it in the Layers tab.
  Automated sliders lock and show their lane's color there. Hover a
  free slider and press the lightning icon to give it a lane.
- Lanes are saved with the layers, so a reload keeps them.
- Drag the grip above the editor to resize it. The video keeps its
  frame shape in the space left over.

Spec: product spec for the tasteink visualizer (behavior only).
