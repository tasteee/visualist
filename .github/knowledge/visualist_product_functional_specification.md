The Visualizer Editor — A Complete Guide to Designing Music Visualizer Interfaces

A complete textbook for one builder

# The Visualizer Editor

Designing premium, joyful, never-frustrating interfaces for VISUALIST, a music visualizer editor — one editor panel with Timeline and Modulation tabs, layers, signal emitters, automation lanes, mappings, one-shot AD envelopes and export.

You are not building an ordinary video editor. You are building an instrument that listens to a song and conducts light. This book gives you the language, the architecture, the patterns, the secrets, and — at the end of almost every chapter — the exact questions to ask before you move on.

**Written for:** the tasteink visualizer editor shown in this book
**Covers:** layout  ·  colour  ·  type  ·  timeline  ·  reactive mapping  ·  interaction  ·  panels  ·  export  ·  accessibility  ·  a full audit of your current build

How to read it: Parts I–III are foundations — read once, slowly. Parts IV–VII are the workshop — keep them open while you build. Part XI is your personal audit, and Part XII is the checklist you run before anything ships.

Before Chapter 1

## How to use this book — and the words you were missing

> **The framing this whole book hangs on:** *To build a high-density, professional Non-Linear Editor (NLE), you must transition from thinking like a web designer to thinking like a systems engineer. You are not building a webpage; you are building a specialized heads-up display for data manipulation.*

Keep that sentence in view. Every chapter that follows is what it looks like in practice.

Most frustration in interface design is not a lack of talent. It is a lack of names. Once you can name a thing — squeeze, inspector, envelope, affordance — you can search for it, argue about it, and fix it.

### The five kinds of page in this book

**Principles** tell you why. **Patterns** tell you what to build. **Numbers** give you starting values (heights, sizes, ratios) you can tune later. **Gotchas** are the traps that cost weeks. **Questions** — in the dark boxes — are the exam you set yourself at each step. If you cannot answer a question box, that is the next thing to work on, not a failure.

### Core vocabulary

| Term | What it means in your app |
| --- | --- |
| **NLE** | Non-linear editor. Any editor where you jump anywhere in time and rearrange freely — Premiere, Resolve, and yours. |
| **DAW** | Digital audio workstation — Ableton, FL Studio. Your second parent: steal more from DAWs than from video editors. |
| **Affordance** | What an element visibly invites you to do. A handle that looks draggable; a slider thumb that looks grabbable. |
| **Progressive disclosure** | Showing only what the current moment needs, revealing the rest on hover, selection, or expansion. |
| **Inspector** | The panel that shows settings for whatever is currently selected. It changes shape with the selection. |
| **Modulator** | In VISUALIST, one of two lane types in the Modulation tab: a signal emitter (point events, intensity 0–100) or an automation lane (a continuous 0–100% curve). A modulator knows nothing about what it will drive. |
| **Mapping** | The first-class third entity that plugs a modulator into a property. The mapping — and only the mapping — owns the target, the signed influence, and, for emitter sources only, the one-shot AD envelope. |
| **Envelope (VISUALIST)** | A one-shot AD shape owned by a mapping: attack ramps gain to peak, decay immediately falls to exactly 0 gain. No hold, no sustain, no release. Like Pigments 1-shot mode. |
| **Token** | A named design value — `--color-neutral-2` — used everywhere instead of a raw hex code. |

**The one-sentence thesis of this whole book**Premium is not decoration. Premium is when every pixel, number and animation behaves exactly as the user predicted — so their attention stays on the music, never on the tool.

Contents

## What is in the book

|  |  |  |
| --- | --- | --- |
| I | **Foundations** — what kind of editor this really is; twelve first principles; reading your own screenshots | Ch. 1–3 |
| II | **Layout architecture** — the viewport split, the squeeze, three-pane tops, docking, grids and sizing | Ch. 4–6 |
| III | **The visual system** — neutral tiers and tokens, accent discipline, typography, icons, shape | Ch. 7–10 |
| IV | **Timeline craft** — ruler, playhead, zoom, minimap, tracks, headers, clips, lanes, waveforms | Ch. 11–14 |
| V | **The reactive system** — modulators (signal emitters, automation lanes), mappings as a first-class entity, influence, one-shot AD envelopes, live feedback | Ch. 15–19 |
| VI | **Interaction** — direct manipulation, cursors, snapping, selection, keyboard, disclosure, undo, errors | Ch. 20–23 |
| VII | **Panels in detail** — preview, inspector, sliders, floating pills vs. docks, transport, export | Ch. 24–27 |
| VIII | **Motion, sound and performance feel** | Ch. 28 |
| IX | **Comfort and accessibility** — long sessions, contrast, targets, reduced motion | Ch. 29 |
| X | **Learnability** — first run, empty states, presets, templates, help | Ch. 30 |
| XI | **Audit of your current build** — what is working, what to watch, what to do next, in order | Ch. 31 |
| XII | **Checklists, build order and glossary** | Ch. 32–33 |

A note on sources and honesty: the layout, tiering and timeline chapters consolidate well-established practice from professional NLEs and DAWs (Premiere Pro, DaVinci Resolve, Final Cut Pro, Ableton Live) applied to your screenshots. Where a number is a convention rather than a law, the book says so — treat every number as a strong starting point, then test it against your own hand and eye.

Part I · Foundations · Chapter 1

## You are building a signal router, not a film cutter

### Supplement — The signal equation, and the extended lexicon

#### The one equation your whole UI exists to show

In a standard editor, a parameter has one static value, or a value set by a keyframe spline at time *t*. VISUALIST works in three layers, and keeping them separate is the whole model:

**Layer 1 — Source (normalised potential only).** A modulator outputs only a number from 0 to 1. A signal emitter does this when the mapping's one-shot AD envelope turns an emission (an instant point event, intensity 0–100) into gain over time. An automation lane does it directly: its value at time *t* is a 0–100% curve, and that percentage ÷ 100 is the signal. Neither modulator knows any property, unit, sign or impact.

**Layer 2 — Mapping (the only converter).** Each mapping takes one modulator's normalised signal and converts it into a property delta: for an automation source, contribution = lane value at *t* × influence; for an emitter source, contribution = envelope gain at *t* × influence, where the envelope's peak for that emission is the influence scaled by (emission intensity ÷ 100). The influence is signed — sign and magnitude live only in the mapping.

**Layer 3 — Property (summed, then clamped).** A property's live value is its static base value (set in the inspector) plus the sum of every mapping's contribution, clamped to the property's own range:

$$V_{\text{final}}(t) = \text{clamp}\left( V_{\text{base}} + \sum_{i=1}^{n} \left[ S_i(t) \cdot \text{Influence}_i \right], \; V_{\min}, \; V_{\max} \right)$$

where $S_i(t)$ already includes the mapping's AD envelope gain when the source is an emitter, and is the automation lane's normalised value when it is not — automation mappings have no envelope, because the curve is already continuous.

Why the maths matters for design: almost every frustration a user will ever have stems from not being able to see one layer of this stack. If Bloom suddenly blows out the screen at 0:05.14, the user needs to know within moments: is the base value too high? Which modulator is active? Which mapping connects them? Is its influence maxed out, or is its decay too long? **Your UI is not a collection of sliders; it is a live diagnostic oscilloscope for that three-layer equation.**

Your app also sits at the intersection of four paradigms, not three: DAWs (audio analysis, impulse triggers, envelope modulators), real-time visual performance systems such as TouchDesigner, Resolume and Notch (continuous signals driving shader uniforms at 60+ fps), motion-graphics compositors such as After Effects and Cavalry (layers in a 2.5D/3D scene graph, cameras, post stacks), and high-density design tools such as Figma, Linear and Blender (flat tiering and progressive disclosure holding hundreds of nodes without claustrophobia).

#### Extended lexicon — the master architect's terms

| Term | Domain | Definition and architectural implication |
| --- | --- | --- |
| Docking tree (binary space partitioning) | Layout architecture | The 100vw × 100vh viewport recursively subdivided into non-overlapping sibling containers separated by 1px draggable splitters (sashes). Zero floating popovers for core workflows. |
| Scrubby sliders (virtual valuators) | Micro-interaction | Numeric readouts or compact pills you click and drag horizontally/vertically to change the value, without needing a wide slider track. Crucial for saving horizontal space in sidebars. |
| Bipolar vs. unipolar modulation | Signal routing | Unipolar pushes one way (0 → +1, an impulse spiking opacity 0% → 100%). Bipolar swings both ways (−1 ↔ +1, an audio signal tilting camera orbit left and right around a centre point). |
| Live modulation ring / ghost thumb | Visual feedback | A secondary indicator on a slider or knob showing the live, post-modulation value ($V_{\text{final}}$) bouncing in real time alongside the static base-value thumb ($V_{\text{base}}$). |
| Envelope follower / slew limiter | Audio DSP / UX | Turns jagged, hyper-fast raw audio amplitude into a smooth curve by applying separate rise (attack) and fall (release) smoothing times, so visual layers don't flicker. |
| Hysteresis & Schmitt triggering | Transient detection | Separate "turn on" and "turn off" thresholds, so a band hovering right at the threshold doesn't machine-gun-trigger an impulse 30 times a second. |
| Coordinate space transforms | Timeline maths | The separation between time space (seconds, bars/beats), normalised space (0.0–1.0) and screen space (CSS pixels). Zooming the timeline is just changing one scalar multiplier: pixelsPerSecond. |
| Semantic zooming | Data visualisation | Changing *how* data is drawn based on zoom level, not just scaling it. At macro zoom an emitter lane shows density blocks; at micro zoom it reveals individual intensity stalks and decay tails. |
| Fitts's law & infinite edges | Ergonomics | Target acquisition time depends on distance and target size. Tools flush against screen edges become "infinite targets" because the cursor stops at the edge of the monitor. |
| Spatial memory & locus of attention | Cognitive science | Users remember *where* a control physically is rather than reading its label. Moving controls inside scrolling popovers destroys spatial muscle memory. |

A film editor arranges blocks of time. Your editor routes signals through time. That single difference should drive almost every design decision you make.

In Premiere, the timeline answers one question: *what is on screen at this moment?* In your app it must answer three at once: what is on screen, **what is driving it**, and **how strongly, right now**. A kick emission is not a clip. An automation curve is not a clip. They are living signals that happen to be drawn on lanes.

### Your three ancestors — steal from each deliberately

| Ancestor | Steal this | Do not steal this |
| --- | --- | --- |
| **Video NLEs** | Docked layout, preview discipline, export thinking, clip trimming | The idea that the timeline is only about arranging media |
| **DAWs** | Automation, velocity, envelopes, solo/mute logic, live bouncing meters and values | Mixer-first layouts; your output is a picture, not a mix |
| **Motion / node tools** | Mapping visibility, easing curves, effect stacks, “what drives what” thinking | Free-floating node spaghetti as the main screen — powerful, but hostile to beginners |

### The mental model to give your user

**MODULATOR** (a signal emitter or an automation lane — pure normalised potential)  →  **MAPPING** (a first-class entity: target + signed influence + a one-shot AD envelope when the source is an emitter)  →  **PROPERTY** (a layer property or a post/global property, whose inspector value is only its static base)  →  **PICTURE**

Every screen in VISUALIST is either staging layers (Timeline tab), showing modulators (Modulation tab), editing a mapping (the inspector, from the modulator's side), adjusting a static base value, or showing the picture. When a screen tries to do two of those jobs at the same size, it becomes confusing — a rule that returns in Chapters 18 and 25.

### Questions to ask — Chapter 1

- Can a new user point at the screen and say where sources live, where mappings live, and where the picture lives?
- If I deleted the word “editor” from my thinking, what would I call each panel instead — and is that name more honest?
- Which DAW do I know best, and have I actually listed what I am borrowing from it?

Chapter 2

## Twelve principles that make software feel premium

1. **Predictability beats cleverness.** If a control does what the user guessed before touching it, you win. Test guesses, not clicks.
2. **The picture is sacred.** The preview is the product. Chrome, panels and decoration always lose arguments to it.
3. **Time is horizontal, strength is vertical.** Never break this axis contract anywhere — lanes, envelopes, intensity, waveforms.
4. **Show the present state, always.** What is selected, what is playing, what is driving what, what will export — visible without asking.
5. **One home for each job.** Timing in the timeline. Configuration in the inspector. Project-wide choices in settings. No job in two homes.
6. **Density is fine. Ambiguity is not.** Pros tolerate 200 controls they understand and hate 10 they do not.
7. **Feedback within a frame.** Drag, scrub, play — the picture and the numbers respond immediately or the tool feels broken.
8. **Make the common path short.** Import song → place a kick emission → create a mapping to glow should take minutes the first time, seconds the tenth.
9. **Forgive everything.** Undo everywhere, autosave, no destructive action without a way back.
10. **Consistency is a feature users can feel.** Same slider, same spacing, same words for the same thing, everywhere.
11. **Calm at rest, alive in motion.** A still screen should be quiet; a playing screen should pulse with information.
12. **Respect the session.** People will stare at this for hours, often at night, often tired. Design for hour three, not minute one.

**The frustration test**Frustration almost never comes from a missing feature. It comes from a violated expectation: a panel that covers the picture, a value that will not type, a drag that snaps when it should not (or does not snap when it should). Hunt violated expectations first; add features second.

Chapter 3

## Reading your own app like a professor would

![Your current build — preview centred on top, Settings / Palette / Post / Export / Options as floating pills top-right, timeline docked full-width below with waveform, automation, layers, and an overview minimap at the very bottom.](.src/media/editor-wide.jpg)

Your current build. Preview centred on top, Settings / Palette / Post / Export / Options as floating pills top-right, transport and time readouts on a left rail and top bar, timeline docked full-width below with waveform, automation, layers, and an overview minimap at the very bottom.

### What a trained eye notices first

- **The good bones are real:** a dark neutral shell that lets the artwork carry the colour; a timeline that already spans the full width; an overview minimap most beginners never think to build; automation drawn as a filled purple lane you can read at a glance.
- **The preview is floating in void.** The black space either side of the centred preview is currently unemployed. Chapter 5 puts it to work.
- **Two navigation ideas compete:** a vertical icon rail on the far left and floating pills top-right. One of them should win, or each needs a clearly different job (Chapter 26).
- **The selected object is doing double duty:** the “MUSIC VISUALIZER” text shows selection handles in the preview — good — but its properties live in pop-over panels rather than a persistent inspector, so selection and editing are in different places.

Keep this page beside you through Part XI (Chapter 31), where the same screenshot gets a full, prioritised audit.

Part II · Layout Architecture · Chapter 4

## Panels must squeeze. They must never cover.

### Supplement — The exact hex stack, and the mechanics underneath the squeeze

#### The 4-step grayscale stack, with hex values

| Level | Hex | Reserved for |
| --- | --- | --- |
| Level 0 | `#000000` | Pure black exclusively: the void surrounding the video preview, the deepest backgrounds |
| Level 1 | `#0c0c0c` | The base canvas of the timeline area, where waveforms and automation lanes live |
| Level 2 | `#1a1a1a` | Structural panels: the left track-header column, the top toolbar, the vertical transport rail — tools sitting "above" the canvas |
| Level 3 | `#2a2a2a` | Active states, selected tracks and hovered components only — to draw the eye only when necessary |

Zero shadows, crisp 1px high-contrast borders between sibling panels. (Chapter 7 maps this onto the full 0–9 token scale.)

#### Implementation mechanics — how the squeeze actually works

- **Root lock (the Scrollbar Trap):** never let the body or root container scroll. Lock the viewport to exactly 100vh × 100vw with `overflow: hidden`. Only internal panels (timeline tracks, the inspector list) get `overflow-y: auto`.
- **Flex mechanics:** tie the timeline's resize handle to the CSS `flex-grow` / `flex-basis` of the upper and lower containers, or set the top container to `flex: 1` / `height: calc(100vh - timelineHeight)`. Dragging the divider up increases the bottom panel; because the parent is constrained to screen height, the top recalculates and shrinks automatically.
- **No z-index overlays:** the divider must trigger a recalculation of bounding boxes, not slide a panel over the preview on a higher z-index. The timeline dock pushes the video upward and smaller; it never covers it.
- **Constrained scaling:** the video inside the shrinking top container scales proportionally (`object-fit: contain`, or an equivalent bounding-box calculation), maintaining its aspect ratio at every divider position.

#### Preview viewport zooming — Fit vs. 100% / 200% / 400%

When the timeline expands upward and the preview scales down, the user loses pixel-level detail. Solve it *inside* the preview, not by forcing the box bigger: a zoom control defaulting to **Fit** (scale the video to the container), with **100%**, **200%** and **400%** settings that let the user pan around a zoomed-in canvas inside a very short vertical container — while the timeline takes up 70% of the screen.

The single most important layout rule in any editor: the timeline is a sibling of the preview, not a layer on top of it.

Structure the window as one strict vertical stack that fills the screen exactly — top workspace, a draggable divider, timeline — with the page itself never scrolling. Only the inside of panels scrolls. When the user drags the divider up, the timeline grows and the top workspace shrinks by the same amount. The preview inside scales down proportionally to fit its new box, keeping its aspect ratio, letterboxed by the void colour. Nothing is ever cropped and nothing is ever hidden underneath.

ROOT (exactly one screen tall, no scroll)  
├─ **TOP WORKSPACE** — flex: 1, shrinks as timeline grows  
│   ├─ Left dock  ·  **PREVIEW** (contain, centred)  ·  Right inspector  
├─ **DIVIDER** — 1px line, grabbable strip, double-click resets  
└─ **TIMELINE** — height set by the divider, min and max limits

### Rules that make the squeeze feel right

- **Set limits.** The timeline needs a minimum (enough for ruler + two tracks + overview) and the preview needs a minimum (small, but still judgeable). Stop the drag at both.
- **Remember the position** per project, and restore it on reopen. Forgetting layout is a daily paper-cut.
- **Double-click the divider resets** to the default split. Every resizable thing needs an escape hatch.
- **Keyboard resizing too:** with the divider focused, arrow keys nudge it. Mouse-only resizing excludes people.
- **Never animate the drag.** The divider follows the pointer 1:1. Lag here feels like the whole app is made of jelly.

**Gotcha — the overlay trap**If any panel is positioned “on top of” the preview or timeline with a shadow, you have built a future bug report: it will cover the exact thing the user needs at the worst moment. Floating elements are for short, dismissible jobs only (Chapter 26).

Chapter 5

## The three-pane top, docking, and second monitors

### Supplement — The canonical 4-zone split-grid, and the free-space maths

```
+-----------------------------------------------------------------------------------+
| GLOBAL HEADER / TOP BAR (32px — Project, Audio Source, Global Transport)          |
+-------------------+-------------------------------------------+-------------------+
| LEFT DOCK         |           CENTER WORKSPACE            | RIGHT DOCK          |
| (240–280px)       |           (flex: 1)                   | (280–320px)         |
| - Scene graph /   |   +-------------------------------+   | - Contextual        |
|   layer stack     |   |                               |   |   Inspector         |
| - Audio / emitter |   |        WebGL Canvas           |   | - Parameter         |
|   generators      |   |      (aspect-ratio locked)    |   |   controls          |
| - Asset pool      |   |                               |   | - Mappings list     |
|                   |   +-------------------------------+   |   / Envelope shaper |
+-------------------+-------------------------------------------+-------------------+
| TIMELINE / TRANSPORT RIBBON (28px — Time, Bar, BPM, Loop, Zoom, Minimap)           |
+----+--------------+---------------------------------------------------------------+
| T  | TRACK HEADERS| EDITOR PANEL CANVAS — one panel, two tabs: Timeline (layer lanes) / Modulation (emitter + automation lanes) |
| O  | (220px)      | (flex: 1, horizontal scroll synced with the minimap)            |
| O  | - misbehave  |  | |||| ||||||| ||| ||||||||||| |||| |||||| |||| |||||||||||     |
| L  | - Kick Imp.  |  |     |     |     |     |     |     |     |     |     |          |
| R  | - Reacti...  |  |  o-----o     o-----o     o-----o     o-----o     o-----o       |
| A  | - main[text] |  | [ main [text]                                             ]   |
| I  | - boston     |  |               [ boston [audio]                            ]   |
| L  +--------------+---------------------------------------------------------------+
|    | OVERVIEW     | [======= Viewport Lens =======]                                  |
+----+--------------+---------------------------------------------------------------+
```

**The maths that makes this free:** in the current build the preview sits centred with roughly 35% empty black space on its left and 35% on its right. Placing a 240–280px Left Dock and a 280–320px Right Dock into those empty wings means the WebGL canvas barely has to shrink — you gain two permanent, zero-occlusion control panels essentially for free.

**Where the pills go:** the top-right pill bar (Settings | Palette | Post | Export) becomes the *tab header of the Right Dock*. Clicking Post switches the Right Dock to Camera/Lens/Film; clicking a layer such as `main [text]` switches it to the Layer Inspector; clicking Export either switches the Right Dock to export settings or opens a dedicated modal. And for multi-monitor users, build the state so the preview and inspector can be unmounted and re-instantiated in a new native window, leaving monitor 1 as 100% timeline.

### Put the void to work

A 16:9 preview centred on a wide monitor wastes a third of the screen. Professional editors fill that space with two docks: **left**, a media pool / layer list / preset browser — things you pick *from*; **right**, the inspector — settings for the thing you picked. The preview shrinks horizontally, which means it also needs less height, which donates vertical pixels to the timeline. Everybody wins from one move.

| Dock | Belongs there | Never belongs there |
| --- | --- | --- |
| Left | Assets, layers outline, emitter presets, templates | Per-property sliders |
| Centre | Preview, canvas tools, Fit / zoom control | Long forms |
| Right | Inspector: selected layer, mapping, envelope, effect stack | Anything time-based |

### Panel behaviour rules

- Every dock can **collapse to a sliver** (an icon strip) and expand back, without changing the project.
- Every dock has a **minimum and maximum width**; text truncates, it never pushes the preview off-screen.
- **Detaching:** power users will ask to pop the preview (and later the inspector) into its own window for a second monitor. You do not need it on day one — but keep panel content independent of its container from the start, so detaching is a move, not a rewrite.
- **Workspaces:** once docks exist, offer saved layouts (“Mapping”, “Polishing”, “Export”) that rearrange them. One default, done well, beats five presets on launch.

### Questions to ask — Chapters 4–5

- Drag the timeline to its extremes: is anything ever covered, cropped, or unreachable?
- What currently lives in the empty space beside my preview — and if nothing, why not?
- Close and reopen a project: did every panel come back exactly as I left it?

Chapter 6

## Grids, spacing and sizing: the invisible skeleton

### Supplement — Micro-density tokens the base scale is missing

A general design-system scale (base radius 10px; radii 6–14px; spacing starting at 4px) is right for cards, marketing pages and large dialogs — and too coarse for editor chrome. In a dense timeline, 6px is still too round for micro-elements and 4px is too big as a minimum gap. Add four ultra-dense tokens specifically for the editor:

- `--spacing-px: 1px` and `--spacing-3xs: 2px` — for separating mute/solo micro-buttons and timeline clip tracks.
- `--radius-xs: 3px` and `--radius-2xs: 2px` — for timeline clips, minimap lenses and inline numeric badges.

Users cannot see your spacing system, but they can feel its absence instantly — the vague sense that an app is “a bit off” is almost always inconsistent spacing and alignment.

### One spacing scale, used everywhere

Build every gap, pad and margin from a small set — for example **4, 8, 12, 16, 24, 32px** — and nothing else. Inside a track header: 8 or 12px padding. Between a label and its control: 8px. Between panel sections: 16 or 24px, always with a single hairline divider. If a value is not on the scale, it is a bug, even if it “looks fine”.

### Alignment rules for dense screens

- **One left edge.** Labels in a panel share a left edge; values and toggles share a right edge. The eye travels in two straight lines.
- **Baselines, not boxes.** Text sitting next to an icon aligns on the text baseline, not by centring rectangles by eye.
- **Hit targets are bigger than drawings.** A 16px icon still gets a 28–32px clickable area in dense desktop UI (and more for touch). Invisible generosity, visible calm.
- **Fixed where it jitters, fluid where it breathes.** Track-header columns, time readouts and value fields get fixed widths so nothing reflows during playback; canvases and timelines get the fluid space.

### Sizing cheat-sheet (starting points, not laws)

| Element | Start at | Notes |
| --- | --- | --- |
| Track header, collapsed | 28–32px tall | Name + visibility + one state icon |
| Track header, expanded | 56–96px | Room for lane or mini-controls |
| Top toolbar | 40–48px | One row; overflow goes to a menu |
| Overview minimap | 24–32px | Full width, always visible |
| Panel section gap | 16–24px | Plus one hairline rule |
| Slider row | 28–36px | Label, track, value — see Ch. 25 |

Part III · Visual System · Chapter 7

## Surface tiers: depth without shadows

### Supplement — White-text burn, and the green-tint trap in the neutral ramp

**White-text burn:** never use pure white `#FFFFFF` or neutral-9 for standard text labels — it causes retinal burn (eye strain) over long sessions. Standard text stops at neutral-8. Reserve step 9 only for the active playhead, the currently selected track outline, and hover states.

**The green-tinted mid-neutral phenomenon:** in the Zest neutral ramp there is a noticeable warm-sage / olive-green chroma in steps 3–8, with a controlled green-channel prominence in steps 4–7. On editorial websites that warmth feels organic. In a visual compositor it triggers simultaneous-contrast illusions (the Bezold–Brücke and Chevreul effects): after staring at a sage-tinted grey surround, the retina adapts by boosting sensitivity to magenta/red — and against vivid purple and pink accents, the olive neutral is a near-complementary colour, so timeline grid lines start optically vibrating and competing with the purple automation curve. **Fix for the editor workspace theme:** drop the chroma (C in OKLCH) of neutral 0–5 to pure achromatic 0.000, or at most 0.003 tuned softly toward cool slate (H ≈ 260), so the neutrals harmonise with the purple/pink accents instead of clashing. Keep the warm ramp for documentation if you love it; neutralise it where users judge colour.

Your app already uses the right idea — flat greys instead of shadows. This chapter turns that instinct into a system you can defend and extend.

Shadows blur, gradients muddy, and bevels date an app in a year. Flat tiers do the opposite: each surface gets exactly one job, and the eye learns the map in minutes. Build the scale in a perceptually even space (OKLCH is the modern choice) so each step feels like the same amount “more”.

0  
Void

1  
Canvas

2  
Panels

3–4  
Borders

5–6  
Muted

7  
2nd text

8  
Text

9  
Peak

| Tier | Job — and only this job |
| --- | --- |
| **0 · Void** | Root background; the letterbox around the preview. Nothing interactive lives here. |
| **1 · Canvas** | Timeline floor, where waveforms, clips and lanes are drawn. |
| **2 · Panels** | Track headers, toolbars, inspector, docks — tools sit one step above the canvas. |
| **3–4 · Structure** | 1px borders and grid lines only. If a border is brighter than the data, demote it. |
| **5–6 · Muted data** | Waveforms, inactive lanes, unselected icons — present, but quiet. |
| **7 · Secondary text** | Sub-labels, hints, less critical numbers. |
| **8 · Primary text** | Normal labels and values. Stop here for body text — pure white burns eyes over hours. |
| **9 · Peak** | Reserved: playhead, selection outline, hover peak, the one thing happening now. |

**The discipline that makes it premium**Tier 9 is a budget, not a colour. If the playhead, three selections, five hovers and a warning all use peak brightness at once, nothing is peak. Audit any screenshot: count the tier-9 objects. The right answer is usually one or two.

Chapter 8

## Colour beyond grey: one accent, honestly used

### Supplement — The token naming inversion trap (fix this while the app is young)

In the Zest system as it stands, the ramps are inverted: the pink ramp is named `--color-primary-0..9` — with a note that the name is historical and components actually paint `tone="secondary"` with this pink — while the purple ramp is named `--color-secondary-0..9` and is the hue behind `tone="primary"`. The semantic aliases then point `--accent` at purple and `--accent-alt` at pink.

Architect-to-architect warning: when you are deep in WebGL rendering and state logic at 2am, `--color-primary-*` meaning "secondary/alt" and `--color-secondary-*` meaning "primary/accent" will cause endless cognitive bugs. Rename the raw primitive ramps to hue names — `--color-pink-0..9` and `--color-purple-0..9` — and let clean semantic aliases (`--accent`, `--accent-alt`) point to them.

Your shell is neutral for a profound reason: **the user’s artwork supplies the colour**. If the interface is colourful, it lies about the artwork — a purple-tinted panel makes a teal logo look wrong. Keep the chrome neutral and let colour mean something.

### What colour is allowed to mean

- **Accent (your violet):** selection, active automation, the thing being edited, primary action. One accent, one meaning family: “this is live / chosen”.
- **Signal colours:** a small, fixed palette for modulators — e.g. signal emitters in pink and automation lanes in purple, kept everywhere (Modulation tab, inspector, badges, preview overlay). Colour becomes a tracking device across screens.
- **Semantic colours:** red/amber/green only for real states — recording, clipping, error, success — never as decoration.
- **Data fills:** waveforms and lane fills use muted versions of their signal colour, so a lane is recognisable at 40% opacity in peripheral vision.

### Rules and traps

- Never encode meaning in colour alone: pair it with an icon, label or position, for colour-blind users and for greyscale screenshots in bug reports.
- Check accent-on-dark contrast for text and thin lines, not just big blocks — a 1px violet line needs more luminance than a violet button.
- Keep a written token for every colour in use. If a hex value appears that has no token and no job, delete it.
- Beware “purple drift”: five slightly different violets (selection, lane, button, link, logo) read as sloppiness. One violet, tinted by opacity, not by new hexes.

### Questions to ask — Chapters 7–8

- Cover the artwork: can I still tell, from greys alone, what is canvas, panel, border and selection?
- Point at every coloured pixel: what does this colour mean, and does it mean the same thing on every screen?
- How many tier-9 (peak) objects are visible right now?

Chapter 9

## Typography: small, calm, and numerically honest

### The two-font reality of editors

You need a workhorse sans for labels and data, and — optionally — a display face only for the cover, empty states and marketing surfaces. Inside the working UI, one family in three weights beats three families in one weight.

- **Category labels:** 9–10px, bold, uppercase, letter-spaced (your CAMERA / LENS / FILM headings already do this well).
- **Primary labels and values:** 12px, regular/medium. This is the reading size of the app.
- **Secondary text:** 11px in tier-7 grey — hints, units, “Locked while recording”.
- **Nothing below 9px** for anything a user must read. Tiny text is not density; it is exclusion.

### Numbers deserve their own rules

- **Tabular numerals everywhere time or values appear** — timecode, bar/beat, BPM, percentages, slider values. Without them, digits change width as they change value and the whole interface visibly jitters during playback. This one CSS habit (`font-variant-numeric: tabular-nums`) is the cheapest premium upgrade in this book.
- **Align numbers right** in columns, with units in a quieter tier, so magnitudes compare vertically at a glance.
- **Decide precision per control and keep it:** opacity 0–100 or 0.00–1.00 — pick one language per property family and never mix (your current UI mixes 0.68-style values with 0–1 sliders; Chapter 31 flags it).
- **Labels name the thing, values show the state:** “Camera distance — 1.00”, never a bare number floating beside an icon hoping to be understood.

**Wording is interface**Verbs on buttons (“Export video”, not “OK”), nouns on panels, and plain descriptions under section headings — your Post panel’s one-line explainers (“Looks at the frame in 3D…”) are exactly right. Keep them, everywhere, in the same voice: short, concrete, no jokes in error messages.

Chapter 10

## Icons, shape and borders

### Icons

- One grid (16px is the editor standard), one stroke weight, one corner style. Mixed icon sets are the fastest way to look amateur.
- Icons identify *categories* (text layer, audio, camera); text identifies *instances* (“main [text]”). Do not make users decode an icon when a three-word label fits.
- State icons (eye = visible, lock, mute/solo equivalents) must show state, not just exist: dimmed, struck, or filled — at rest, without hover.
- Every icon-only button gets a tooltip with its name *and shortcut*, appearing fast (about 400–600ms) and never covering the thing it describes.

### Shape

- **Small radii in the working UI:** 2–4px on clips and lanes, 6–8px on panels and cards, full-round only on pills, toggles and slider thumbs. Big bubbly corners on timeline clips create optical gaps between neighbours that should butt together.
- Radius is a hierarchy cue: the rounder and larger a thing is, the more “product/marketing” it feels; the squarer, the more “instrument”. Your editor is an instrument with a friendly face — keep the timeline square-ish and let onboarding and export be softer.
- **Borders, not shadows**, inside the app (your current choice — keep it). Reserve shadows for genuinely floating, temporary layers: menus, tooltips, drag ghosts.

Part IV · Timeline Craft · Chapter 11

## The timeline is an instrument, not a filing cabinet

### Supplement — Musical time, bar numbers, and where the minimap lives

**Users think in musical time, not wall-clock time.** Nobody places an emission "at 0:05.14" — they place it on Bar 3, Beat 3, 16th-note 1: **3.3.1**. Design the ruler for that brain:

- **Print the bar numbers on the ruler itself** — 10px tabular numerals in a muted neutral, at every major grid division. (The current build shows tick marks and a BAR 3.3 readout in the corner, but no numbers along the ruler.)
- **Two weights of grid line:** full-height vertical lines on every downbeat (bar boundary) at a stronger neutral step; subtler lines on every quarter-note beat.
- **Magnetic grid snapping:** default emission and automation-point placement to snap to 1/16 or 1/8 musical subdivisions of the song's BPM grid — and let Alt/Cmd temporarily bypass snapping so an emission can slide freely onto an unquantized live drum transient.

**A note on minimap placement — there are two respectable answers.** The pasted NLE guidance places a ~24px minimap *above* the tracks, directly below the transport controls, with a semi-transparent viewport lens (neutral-2 fill, 1px neutral-6 border) you can drag to pan. Your current build places the overview *at the very bottom*, below all tracks. Either can work; what matters is that the lens always shows where the current zoom sits in the whole project, that it stays visible at every scroll position, and that you pick one home and keep it there (spatial memory — see the extended lexicon in Chapter 1).

### One editor panel, two tabs — the decided architecture

VISUALIST has **one** editor panel, docked at the bottom of the window. Inside it are two editors, as tabs:

- **Timeline tab** — layer lanes only. This is where layers are chronologically staged (start/end), arranged, and stacked. One kind of thing per lane, one verb for the tab: *arrange*.
- **Modulation tab** — modulator lanes only: signal emitter lanes and automation lanes. No layer lanes live here, and no automation lane is ever nested under a layer. One verb for this tab too: *animate*.

**Why not nested lanes?** Because nesting does not scale and does not parse. Eight layers with several modulatable properties each becomes dozens of sublanes under parents the user must expand, collapse and hunt through — a wall of indented curves where every lane's owner has to be re-derived by eye. Separation is calmer: each tab holds one kind of lane, the hierarchy question ("which layer does this belong to?") disappears, because in the Modulation tab a lane belongs to no layer at all — it connects to properties only through mappings (Chapter 18).

The split only works with these safeguards, which are requirements, not options:

- **Shared state across tabs.** Both tabs share one playhead, one timebase, one horizontal zoom, one horizontal scroll position, one loop region and one selection. Switching tabs never resets the view — the moment you were studying is the moment you land on.
- **Reference rows in the Modulation tab.** Pinned at the top of the Modulation tab: the master audio waveform, and beneath it a thin, read-only layer-presence strip showing when each layer is on stage. You must never have to guess whether a layer you are mapping a kick to is even present at that time.
- **Modulated indicators in the Timeline tab.** Any layer that has mappings wears a small "modulated" indicator in the Timeline tab, and its driven properties show driven-by badges in the inspector — so animation is discoverable without switching tabs.
- **The stage never hides.** The preview stays visible above the panel in both tabs, and selecting a mapping highlights its target layer in the preview.

### Anatomy, top to bottom

| Strip | Job | Rules |
| --- | --- | --- |
| **Transport bar** | Play state, time, bar/beat, BPM, zoom | Time readouts tabular; play state unmistakable |
| **Tab bar** | Timeline / Modulation — the panel's two editors | Shared playhead, zoom, scroll, loop and selection across both tabs |
| **Ruler** | Time scale; click/drag to scrub | Ticks adapt to zoom; bars/beats labelled at musical zooms |
| **Loop / range strip** | Export and loop regions | Draggable edges; visibly different from clips |
| **Track stack** | Timeline tab: layer lanes only. Modulation tab: emitter + automation lanes only, with pinned reference rows on top | Headers locked to rows; one shared horizontal scroll |
| **Overview minimap** | Whole-song context + viewport lens | Always visible; drag lens to travel (you have this — protect it) |

### The playhead is the most important pixel in the app

One crisp vertical line, full height of the track stack, in the peak tier, with a grabbable head in the ruler. During playback it moves; during scrubbing it obeys the pointer exactly. Two playhead behaviours to choose between, consciously: **page** (the view jumps when the head exits) for editing, and **smooth scroll** (the world moves, the head stays centred) for watching reactions. Offer the toggle; default to page for editors, centred for previewing.

### Zoom is two different zooms

- **Horizontal (time) zoom** changes seconds-per-pixel. Anchor it on the playhead or the pointer, never on the left edge — zooming must never throw the user away from the moment they were studying.
- **Vertical (track) zoom** changes track heights as a group, on top of per-track heights (Ch. 12).
- Show zoom as a readable value (your “14.5×” is good) and give it a “fit whole song” command. Getting lost must always be one keystroke from home.

Chapter 12

## Tracks and headers: micro-ergonomics

### Supplement — Header micro-numbers, the two-tab lane discipline, and colour-by-domain

**Micro-numbers worth memorising:** track-header icons at 12×12 or 16×16px; header padding a strict 8px or 12px; category labels in uppercase 9–10px bold, primary data at 12px standard weight; track names strictly left-aligned, numerical values and toggles strictly right-aligned against the timeline edge. Names truncate aggressively with an ellipsis — the truncated lane labelled "Reacti…" in the current build is exactly the failure this prevents from mattering: if the full name lives in the inspector and on hover, truncation is harmless; if it lives nowhere else, it is a bug. **Density target: at least 15 tracks visible on a 1080p monitor in Micro state without scrolling.**

**No nesting, no tree lines — the tabs do the grouping.** Earlier drafts of this book recommended indenting automation lanes under their parent layers, with tree guide lines to prove ownership. VISUALIST's decided architecture replaces that entirely: layer lanes live only in the Timeline tab, and emitter and automation lanes live only in the Modulation tab, at the same visual level, owned by no layer. Ownership questions are answered by mappings (Chapter 18), not by indentation. What replaces the sticky master section is the Modulation tab's pinned reference rows: the master audio waveform on top, with a thin read-only layer-presence strip beneath it, visible however far the modulator lanes scroll.

The current build shows why the split was needed: `misbehave.mp3` sits beneath an "AUTOMATION" group while `boston [audio]` is down at the bottom; "Reacti… 0.68" reads as an orphan — global parameter, child of the song, or child of Post?; and "Camera distance 1.00" sits *above* Post even though Camera Distance is a sub-section *inside* the Post panel. One mixed stack forced song, drivers, layers and effects to share one visual level, so the hierarchy never read at a glance. Two tabs give each kind of lane its own home instead.

**Colour must encode signal type, not decorate:** master audio / reference track — neutral silver (neutral-6 waveform); signal emitters — pink (accent-alt); automation lanes — purple (accent); visual scene layers (text, video, images) — a calmer layer colour of their own; global post / camera / environment — amber or cyan.

### Four heights, four jobs

| State | Height | Shows |
| --- | --- | --- |
| Micro | 24–28px | Name, visibility, signal colour chip |
| Compact | 32–44px | + waveform/clip mini-view, mute/solo equivalents |
| Standard | 56–72px | + clip detail, or one emitter/automation lane fully editable |
| Expanded | 96px+ | + intensity editing on emitter lanes, curve detail on automation lanes |

Users resize individual tracks by dragging the header’s bottom edge; a global control sets all at once. Fifteen tracks should fit a 1080p screen in micro/compact without scrolling — do the arithmetic for your own default heights and hold yourself to it.

### Header anatomy

- Left-aligned, truncated name (ellipsis, full name on hover/inspector). Signal colour chip or type icon first — recognition before reading.
- Right-aligned cluster: value readout (tabular), visibility eye, then hover-revealed utilities (lock, duplicate, delete, add lane).
- Hovering *anywhere* on the row — header or canvas — lifts the whole row one tier. On a wide monitor this horizontal banding is how the eye stays on the right lane.
- Track order is musical order: decide a convention (e.g. background at bottom, hero text near top; in the Modulation tab, emitters grouped by instrument) and make “add” insert in the sensible place, not just at the end.
- Grouping and colour: when projects pass ~10 layers, folders/groups with collapse are not optional — inside each tab separately. Signal emitter lanes especially want a group (“Drums”) in the Modulation tab that can be muted as one.

### Questions to ask — Chapters 11–12

- Zoom fully in, then fully out: can I always get home in one action?
- At default size, how many tracks fit without scrolling — counted, not guessed?
- Cover the names: can I still tell tracks apart by icon, colour and content?

Chapter 13

## Clips, lanes and automation without the sprawl

### Supplement — Radii discipline, and the equal-padding trap

**Clip radii: 1–2px, never pill-round.** Heavy rounding creates optical gaps between adjacent clips and wastes vertical stacking space. Timeline clips are rectangles that happen to have softened corners, not pills.

**The equal-padding trap:** in the current build, lanes such as *Echoes amount*, *Echoes speed* and *Warp* all consume equal vertical padding. Pro editors rarely expand the whole dock to see more lanes — they expand and collapse *individual lanes independently*, within whichever tab they are in. Unused lanes collapse to minimal slivers (name + mute/solo); the lane being edited expands. Equal padding for unequal importance is how a 10-lane project starts feeling like a 40-lane one.

### Clips

- Clips butt together cleanly (small radii, Ch. 10), show name + type, and show a mini-waveform or thumbnail whenever the media has one.
- Edges are trim zones with the resize cursor; the body is a move zone with the grab cursor; the distinction must be visible in cursor alone, before any click.
- Selected clips get the peak outline plus visible handles; multi-selected clips share one consistent treatment (Ch. 21).
- Fades, disabled state and “muted” state each have a distinct, at-rest visual — dimming alone is not enough for all three.

### Automation lanes: pure potential, drawn in the Modulation tab only

An automation lane in VISUALIST is **not** a property's curve, and it is never drawn over or nested under the layer it will eventually affect. It lives only in the Modulation tab, and it knows exactly one thing: its own value, 0–100%, at every moment across the whole project duration. Points set the value; each segment between points carries a curvature. The lane does not know property units, sign, direction or impact — it is pure normalised potential, and it only becomes a property change inside a mapping (Chapter 18).

- Draw the curve filled beneath at low opacity, in the automation colour, with the 0% and 100% lines always legible — height *is* the value, and nothing else in the lane competes with it.
- Each point is a grabbable node; segments show their curvature and a modifier or drag on the segment bends it. There is no "hold / linear / smooth" property semantics to teach — only value and curvature.
- Double-click a line adds a point; double-click a point deletes it. State these in the tooltip/help — undiscoverable gestures need teaching (Ch. 30).
- Dragging a segment between two points bends or shifts it predictably; snapping to grid and to other points is toggleable and visible.
- Values appear next to the cursor while dragging (tabular, as a percentage) — never make the user drag, release, then read.

Chapter 14

## Drawing sound: waveforms and spectrograms

### Supplement — Why the spectrogram toggle earns its place

A standard volume waveform is not enough when users are placing signal emitter points by ear and eye: it shows *how loud*, never *which frequencies*. Offer a toggle on the main audio track to view it as a spectrogram — a heat map of frequencies over time. That is what lets a user visually isolate where the high-frequency hi-hats live versus the low-frequency 808s, and place emissions precisely on target instead of guessing from amplitude alone. (Bands and detection are placement helpers in VISUALIST, not modulator types — the modulators are emitters and automation lanes. See Chapter 17.)

The waveform is the map your users navigate the song by. If it is wrong, blurry or slow, every emission lands in the wrong place and the whole app feels untrustworthy.

- **Peaks, not samples:** render min/max peaks per pixel column, precomputed and cached, so zooming is instant at every level.
- **Mirrored vs. single-sided:** mirrored (centred) reads as “music” and suits the main audio track; single-sided (baseline) suits lanes where height already means something else, like emitter intensity.
- **Colour with restraint:** muted tier for the waveform body; brighter where clipped or above a threshold, if you show it at all.
- **Spectrogram view:** because users place emitter points against frequency content, offer a toggle that draws the audio track as a frequency heat-map (time horizontal, frequency vertical, brightness = energy). It is the only honest way to *see* where the hats live versus the 808. Label the frequency axis when it is on.
- **Transient markers:** when the app detects onsets, draw faint ticks on the audio track. Users placing emissions will bless you; make them snappable targets (Ch. 20) and removable when the detection is wrong.
- **Grid honesty:** bar/beat grid lines must come from the project’s BPM/offset settings, and changing BPM must visibly re-grid. A grid that disagrees with the music destroys trust faster than any bug.

**Performance is a design feature here**Waveform drawing, playhead movement and preview rendering share one frame budget. If scrubbing the playhead stutters, users will call the app “cheap” no matter how beautiful the still screenshots are. Budget for 60fps scrubbing from the first prototype of any timeline change.

Part V · The Reactive System · Chapter 15

## Modulators: the two ways potential is authored

VISUALIST has exactly two modulator types. Both live only in the Modulation tab, and both output nothing but a normalised signal, 0–1. Industry software also offers analysed sources (frequency bands, transient detectors, LFOs); in VISUALIST those ideas survive only as *placement helpers* for emitter lanes (Chapter 17), not as modulator types.

| Modulator | What it is | Its output | Failure mode to design for |
| --- | --- | --- | --- |
| **Signal emitter lane** | Point events the user placed in time, each an instant emission with intensity 0–100 — for example, an emission on every kick | Nothing by itself: an emission becomes signal only inside a mapping, whose one-shot AD envelope turns intensity into gain over time (Ch. 19) | Tedium — placing 200 emissions by hand needs help (Ch. 16) |
| **Automation lane** | A continuous curve of points with per-segment curvature, spanning the whole project, valued 0–100% | Its value at time *t*, ÷ 100, directly — no envelope, ever | Meaninglessness if read alone: the lane is pure potential, so its mappings must always be one click away |

### Give every modulator an identity

- A name the user can edit (“Kick”, not “Emitter 3”), a fixed signal colour, and an icon. That identity follows the modulator into every list, badge and inspector in the app.
- Modulators live in the Modulation tab (they happen in time) and are *managed* in the inspector when selected: rename, colour, and — most importantly — their Mappings list (Chapter 18).
- Show a live output level for each modulator during playback — a small meter or a brightening chip in its header — so users can confirm the signal they think is firing is firing.

Think of modulators as **performers** and layers as **dancers**. A mapping is choreography: it says which performer each dancer watches, and how dramatically they respond. Your UI's job is to make the choreography visible at a glance.

Chapter 16

## The signal emitter lane: a one-row drum machine for pictures

### Supplement — Anatomy of an emission: the intensity stalk and the decay ghost tail

An emission is not a 1px line or a dot. Draw two things:

- **The intensity stalk:** a crisp 2px vertical bar anchored at the bottom of the lane. Its height — 0% to 100% of track height — *is* the emission's intensity, 0–100. The user grabs the top cap of the stalk and drags vertically (cursor: `ns-resize`) to set it: a ghost note at ~25, a heavy accent at 100. Height and colour brightness both encode intensity, so it reads at any zoom.
- **The decay ghost tail:** behind the stalk, a subtle translucent polygon (the emitter colour at ~15% opacity) tracing a mapped AD envelope's fall back down to zero over time. This is not decoration: if two kicks are close together and a mapping's decay is set to 600ms, the user can *physically see* the first emission's tail overlapping the second stalk, right on the lane. Because the tail belongs to a mapping, not to the emitter, show the tail for the currently selected mapping — and when several mappings exist, say so rather than drawing three tails and calling it clarity.

**One more creation method — auto-detection:** alongside clicking emissions onto the beat grid, offer an "Auto-Detect Kicks / Transients" action that proposes stalks from audio analysis for the user to accept, move or delete. Placing 200 emissions by hand is a chore; *editing* 200 detected ones is a workflow.

This is your signature surface. Treat it with the care piano-roll editors give MIDI velocity — because that is its closest industry cousin, with one row and a visual purpose. In VISUALIST's own words, though, it is always *intensity*, never velocity.

### Drawing emissions

- Each emission is a vertical strike on the row. **Height = intensity**, redundantly coded (taller *and* brighter) so intensity reads at any zoom.
- Click places an emission at full intensity (100); dragging vertically while placing sets intensity; scroll/alt-drag on an existing emission adjusts it, with the numeric value shown live.
- An intensity strip beneath the row (the DAW velocity-strip pattern) lets users lasso several emissions and reshape their intensities as a phrase — crescendos across a build are where this earns its keep.

### Making 200 placements feel like 20

- **Snap to transients and grid** by default; hold a modifier for free placement.
- **Detect and offer:** “Place emissions on detected kicks?” — generate from onsets, then let the user edit. Generation is a starting point, never a lock-in.
- **Pattern tools:** duplicate a bar across the song, repeat every N beats, nudge selection by one beat, quantise selection. Choreography is repetitive by nature; the tool should absorb the repetition.
- **Audition:** clicking an emission flashes, in the preview, the layers its emitter drives through its mappings. Placing blind is placing twice.

### Questions to ask — Chapters 15–16

- During playback, can I see every modulator “performing” without opening anything?
- Time me: how long to place emissions for a full verse of kicks from scratch? Where did I get bored or lost?
- Select five emissions: can I change all their intensities in one gesture?

Chapter 17

## Detection helpers: bands and transients as placement tools

Bands and transients are **not modulators in VISUALIST** — nothing maps from a band, and no mapping has a threshold. Their job is narrower and still valuable: helping the user place signal emitter points accurately against the master audio, in the Modulation tab whose pinned reference row is that audio. The UI must make these invisible forces visible, adjustable, and forgiving — otherwise users place blind and blame the music.

### Band views for placement

- Preset views first — Sub / Bass / Low-mid / Mid / High / Air — as a visual strip over a miniature spectrum, not a dropdown of numbers. Switching the view changes what the reference waveform/spectrogram emphasises, so the user can *see* where the kicks or hats live.
- Custom range by dragging edges on that same spectrum strip, with the range in Hz shown in tabular numbers. The spectrum behind it should be the *actual song's* average spectrum when you can manage it.
- A band view is a lens on the audio, never a source: it creates no mappings and appears in no Mappings list.

### Transient controls that respect the user

- **Sensitivity / threshold** as a slider drawn *over* the waveform: a horizontal line the user drags down through the peaks, watching markers appear and disappear live. This single picture teaches the whole concept.
- Always show the count (“48 hits”) and a play-through preview that flashes markers as the song plays.
- Wrong detection must be cheap to fix: delete a marker, add a missing one, and the system stops re-adding what the user deleted.

**Secret: name the feeling, not just the physics**Alongside technical labels, plain outcome words help beginners choose: “Punch” (kick emitter, fast AD), “Shimmer” (automation lane, gentle influence), “Heartbeat” (kick emitter, slow decay). Ship them as mapping presets (Ch. 30), not as replacements for the real controls.

Chapter 18

## Mapping: the third entity is the product

A mapping is not a property of the modulator, and it is not a property of the layer. It is a **first-class entity of its own** — the plug that connects a modulator (the male plug) into a property (the female outlet), and the only place where potential becomes a concrete change.

### The data model, stated once and used everywhere

**Modulator → Mapping → Property**

| Entity | Owns | Knows nothing about |
| --- | --- | --- |
| Modulator (emitter lane or automation lane) | Its own normalised output over time, 0–1 | Targets, sign, impact, property units |
| Mapping | Target (layer + property, or a post/global property); signed influence; and — only when the source is an emitter — the one-shot AD envelope | — this is the connector; it is allowed to know both ends |
| Property | Its static base value, set in the inspector, and its own legal range | Modulators, influence, envelopes |

Sign and magnitude live **only** in the mapping's influence. A 100% automation value or a full-intensity emission can push a property up a lot, up a little (a 10–20% influence), or *down* — a negative influence is how a kick ducks a volume or dims a glow. Multiple mappings can target the same property at the same time; their contributions sum, and the property clamps the total to its range (Chapter 1).

### Where a mapping lives in the UI — the decided placement

**The mapping's canonical home is the modulator's side.** In the Modulation tab, selecting an emitter or automation lane shows that lane's **Mappings list** in the inspector. Each mapping's editor opens there (or from the lane's options menu): target picker, influence scrubber, and — for emitter sources only — the AD graph (Chapter 19). It may *look* nested inside the modulator lane's options, and that is fine: organisationally it sits with the modulator, while conceptually it belongs to neither end.

**The property side gets a read-mostly mirror, never a second editor.** On the property itself — in the layer inspector or the Post inspector — show a badge such as "Driven by Kick · −50% · AD 5/400ms". The badge is not editable in place; clicking it jumps across to the mapping in the Modulation tab, where the one canonical editor lives. One editor, two entry points, no duplicated state, no chance of the two sides disagreeing.

### Supplement — Creating a mapping without a dropdown of 80 items

Never force a user through a nested menu (Main Text → Transform → Scale → X) just to create a mapping. But however a mapping is created, it must end up in the same place: the modulator's Mappings list.

- **The list door (primary):** with a modulator lane selected, "Add mapping" in its inspector Mappings list → pick the target property → set influence (and AD, for emitters). Deliberate, discoverable, and the reference workflow.
- **The badge door:** on a property, "Drive this…" starts the same creation flow from the other end — pick a modulator — and still files the result under that modulator's Mappings list.
- **The drag shortcut (later):** dragging from a modulator lane onto a property in the preview or inspector can *create* a mapping in one gesture. It is a shortcut for creation only; the mapping it creates lives in the Mappings list like any other, and is edited there. There is no persistent cable view to maintain.

If users get lost anywhere, it will be here: "what is driving what?" Design mapping so that question is always answerable in under three seconds, from either direction.

### Two-way visibility (the golden rule of this chapter)

- **From the modulator:** select an emitter or automation lane → its Mappings list shows everything it drives, and the driven layers flash/badge in the preview and the Timeline tab.
- **From the target:** select a layer → every driven property shows its badge in the inspector, and the property's control is visually distinct — tinted, badged, never silently moving. Selecting a mapping (from either side) highlights its target layer in the stage preview.
- **In the Timeline tab:** a small "modulated" indicator on any layer that has mappings, so animation is discoverable without switching tabs.

Removing a mapping is one click from its Mappings list (and offered from its badge), with undo. A property returns to its static base value — and the UI must say what that value now is.

Chapter 19

## The one-shot AD envelope, influence and live feedback: shaping the fall

### The envelope, specified correctly

VISUALIST's envelope is **one-shot AD — no sustain, no release** — the mode Pigments calls 1-shot. It belongs to the **mapping**, never to the emitter and never to the property, and it exists only when the mapping's source is a signal emitter. It has exactly four parameters: **A ms, A curve, D ms, D curve.** Nothing else.

The sequence, step by step:

1. A signal is emitted — an instant point event with intensity 0–100.
2. A mapping from that emitter to a property turns the emission into influence over time.
3. The mapping's AD envelope shapes that influence: gain **ramps from 0 to peak over A ms**, shaped by the attack curve.
4. **Decay begins immediately at the peak** — there is no hold and no sustain — and gain **falls over D ms**, shaped by the decay curve, **to exactly 0 gain**.
5. Ending at 0 is a law, not a setting. The user controls how long D takes and the shape of its curve, never whether it reaches 0.
6. The peak gain for that emission is the mapping's influence × (emission intensity ÷ 100). A half-intensity emission through a −50% influence mapping peaks at −25% of the property's mapped range, then decays to 0.

Automation-lane mappings have **no envelope at all**: the automation curve is already continuous, so the contribution is simply lane value at time *t* × influence, directly.

> **Decided behaviour — retrigger and overlap.** Each emission spawns an independent envelope instance. Simultaneous instances from the same mapping **sum**, and the mapping's total envelope gain is **clamped to 1.0** — 100% of its influence — so a fast kick roll saturates gracefully at maximum influence instead of stacking past it, and a new hit never chops the previous tail to zero.

Different targets want different physics from the same hit — and because the envelope lives on the mapping, one kick emitter can give each target its own physics:

| Target | Physics that usually works |
| --- | --- |
| Text scale / camera shake | Instantaneous 0ms attack; snappy concave exponential decay (fast drop, smooth settle) |
| Glow / bloom intensity | ~15ms attack so it swells slightly; slower S-curve decay to 0 |
| Flash / invert effect | Near-0ms attack and a very short, steep decay — a spike that is gone almost at once, still ending at exactly 0 |

"It hits, rises, and falls back to zero" is the whole envelope, and the fall is where the art lives. A glow that snaps off feels cheap; one that breathes feels expensive. Give users the fall, in miniature.

### The minimum viable envelope editor

Put a compact interactive envelope graph — roughly **120 × 60px** — inside the mapping editor (in the modulator's Mappings list, Chapter 18), showing only the two segments: the attack ramp and the decay fall to a fixed 0 endpoint that cannot be dragged upward.

- Four scrubbable values beneath the graph: **A (ms)**, **A curve**, **D (ms)**, **D curve**. Each segment has its own time and its own curve/tension; dragging on a segment bends that segment only.
- The graph and the numbers sync both ways, in tabular figures.
- Per-mapping, never global and never per-emitter: the same kick emitter can drive a fast snap on one property and a slow breath on another, because each mapping carries its own AD.
- Envelope presets are welcome (Chapter 30) — but a preset is just saved A/A-curve/D/D-curve values on a mapping, fully visible once applied.

### Live parameter bouncing — your best teacher

During playback and scrubbing, driven controls in the inspector must **move**: sliders slide, numbers count, the little envelope graph traces its own value. This is borrowed directly from DAWs and it does three jobs at once — it proves the mapping works, it teaches the relationship, and it makes the app feel alive. Pair it with the property's driven-by badge (Chapter 18) — which states the source, the signed influence and the AD summary, and jumps to the mapping when clicked — so a moving slider never feels like the app is fighting the user. The base value itself is not dragged while it is bouncing; the user edits influence in the mapping.

### Questions to ask — Chapters 17–19

- Pick any moving thing in the preview: can I find what drives it in under three seconds?
- Pick any modulator: can I list everything it drives, from its Mappings list, without hunting?
- Can I make the same kick emitter produce a snap on one layer and a slow breath on another — two mappings, two AD envelopes?
- While playing, do driven values visibly bounce in the inspector?

Part VI · Interaction · Chapter 20

## Direct manipulation, cursors and snapping

### Supplement — The full cursor table, and hover row banding

Because a flat, zero-shadow interface cannot rely on shadows to say what is clickable, the cursor and row states do the heavy lifting:

| Hover target | Cursor |
| --- | --- |
| Edge of a clip | `ew-resize` |
| Middle of a clip | `grab` |
| While dragging a clip | `grabbing` |
| Automation point / line | `crosshair` (or `ns-resize` for value drags) |
| Top cap of an emitter intensity stalk | `ns-resize` |

**Hover row banding:** hovering anywhere over a track's full horizontal real estate — header *or* canvas — subtly bumps that entire row's background one step (neutral-1 → neutral-2). Across a 3,000px-wide timeline on a wide monitor, that band is what stops the user's eye losing which lane it is reading.

### The cursor is a promise

| Hovering | Cursor | Meaning |
| --- | --- | --- |
| Clip edge | ↔ resize | Drag trims |
| Clip body | Grab | Drag moves |
| Automation point | Crosshair / move | Drag reshapes |
| Ruler | Text / pointer | Click sets playhead; drag scrubs |
| Divider | ↕ resize | Drag resizes panels |
| Canvas object edge/corner | Resize / rotate | Matches the handle’s geometry |

Change the cursor *on hover*, not on mousedown. The promise must arrive before the commitment.

### Snapping: helpful, visible, escapable

- Snap targets, in priority order: playhead, loop edges, clip edges, detected transients, bar/beat grid, other emissions.
- When a snap catches, *show it* — a brief highlight line at the target. Invisible snapping feels like the pointer is sticky and broken.
- One global snap toggle with a shortcut, plus a hold-to-disable modifier. State (on/off) always visible near the timeline toolbar.
- Snap strength should feel magnetic within a few pixels and release cleanly beyond it — never a hard teleport at long range.

### Drag behaviour rules

- What you grab is what moves: grab a clip by its left third and it must not jump to centre under your pointer.
- During any drag, show the live numeric consequence (time, value, intensity) beside the pointer.
- Escape cancels any drag, restoring the exact prior state. Enter/pointer-release commits. Every drag is one undo step, no matter how long it lasted.

Chapter 21

## Selection, the keyboard, and doing things ten at a time

### Selection is a language — keep its grammar tiny

- Click selects one. Shift-click adds. Dragging on empty canvas marquee-selects in the timeline; in the preview it moves the selected object (choose per surface, and be consistent within it).
- Clicking empty space deselects. Escape steps back one level (close menu → deselect → stop editing) rather than doing everything at once.
- The inspector always reflects the selection — one object, many objects (shared properties editable together), or nothing (project settings). “Nothing selected” is a real state; design its inspector instead of leaving a stale one.
- Selection must survive zooming, scrolling and playback. Losing a careful multi-selection because the song played is a rage-quit event.

### Keyboard: the difference between a toy and a tool

| Family | Minimum set to ship |
| --- | --- |
| Transport | Space play/pause; ←/→ by frame or beat; Shift for larger steps; Home/End |
| Editing | Undo/redo; delete; duplicate; nudge with arrows (with modifier for ×10) |
| View | Zoom in/out/fit; toggle snap; toggle panels; Fit vs 100% in preview |
| Creation | Tap-in emission at playhead (e.g. a dedicated key while playing — “perform to place”) |

Print shortcuts in tooltips and menus — that is how users learn them without a manual. Never use a shortcut that fights the operating system or the browser without an in-app alternative.

Chapter 22

## Progressive disclosure: density without overwhelm

You do not reduce overwhelm by removing power. You reduce it by sequencing attention: now, next, later.

### The three rings

- **Ring 1 — always visible:** name, identity, primary state, the one control this moment is about. A collapsed track header is pure Ring 1.
- **Ring 2 — on proximity:** hover and selection reveal utilities, handles, secondary toggles. Present in space, absent in attention until needed.
- **Ring 3 — on request:** expansion, “Advanced” sections, dedicated lanes, envelope detail. The user opens these deliberately and can close them just as fast.

### Disclosure done wrong (learn to spot it)

- Hover reveals that *move* other content (layout shift on hover is jitter, not disclosure).
- Controls that exist only inside a right-click menu with no other door.
- “Advanced” used as a junk drawer for anything the designer could not organise.
- Disclosure that forgets: panels that re-collapse what the user opened, every single time.

**The squint test**Squint at any screen until detail blurs. You should still see: the picture, the playhead’s neighbourhood, the selection, and the primary action. If a settings toggle is as visible, squinting, as the preview — your rings are inverted.

Chapter 23

## States, errors, undo — and never losing work

- **Every control has five states** and all five must be designed, not inherited: rest, hover, active/pressed, focused (keyboard), disabled. Disabled must also say *why*, on hover or in nearby text — your Export panel’s “Locked while recording” is the model.
- **Loading and rendering states** are part of the design: waveform computing, export progress with time-remaining honesty, and a cancel that actually cancels.
- **Errors speak like a person and act like a tool:** what happened, what it means for the work, what to do next — in that order, beside the thing that failed, not in a distant toast alone. “Audio could not be decoded — try a WAV or MP3 export of the file” beats “Error 0x…”.
- **Undo is a timeline too:** full-history undo/redo for every edit (placement, mapping, value, delete, layout excluded), with menu labels that name the action (“Undo place emission”). If an action cannot be undone, it asks first — every time, no exceptions.
- **Autosave + recovery:** save continuously to a draft; on crash or accidental close, reopening offers the recovered project by name and time. The user should never be asked “did you save?” by a modern creative tool.
- **Empty, first, and broken are different states:** an empty timeline invites (Ch. 30); a broken media link explains and offers relink; neither shows a blank grey void.

### Questions to ask — Part VI

- Cover the labels: do cursors and hover states alone tell me what each drag does?
- Do the ten most common actions all work from the keyboard, and can I discover how from inside the app?
- Delete something important. Now undo it. Now close the app mid-edit and reopen. Is everything still there?

Part VII · Panels in Detail · Chapter 24

## The preview: a stage, not a rectangle

- **Fit by default, real zoom on demand:** a Fit / 50% / 100% / 200% control (your bottom-left “Fit” dropdown is the right seed) with pan when zoomed beyond the box. Zoom state is about *inspection*, never about the export size — keep those ideas visually separate.
- **Selection drawn like a pro tool:** bounding box, corner + edge handles, a rotate handle on a stem (your current text selection already does this well) — handles large enough to grab, thin enough not to eat the artwork.
- **Safe areas and format previews:** because one project exports to landscape, vertical and square, offer guides for the other formats over the current frame. A vertical crop line discovered *at export* is a betrayal; discovered while designing, it is a feature.
- **Overlays with an off switch:** driven-by flashes, modulator activity, emission hit-flashes on layers — invaluable while mapping, noise while polishing. One “Show reactions” toggle controls them all.
- **Background honesty:** the void behind the canvas is tier-0 and textureless, so transparent or dark artwork reads truthfully. A checkerboard appears only when the user asks what is transparent.
- **Playback quality:** dropped frames during preview must never change timing decisions — if the machine cannot keep up, say so (“preview at reduced quality”) rather than silently drifting from the audio.

Chapter 25

## The inspector and the art of the slider

### Supplement — The reactive (dual-value) slider, the 64px → 26px compression, and the five golden mechanics

#### The reactive slider: four values in ~28px

A standard single-thumb slider breaks the moment a property is driven, because it cannot show four things at once: the resting static base value (e.g. Bloom 0.25), how far the mapping's influence will push it (e.g. +0.60 of influence → ceiling 0.85), the live value at the playhead right now (0.52), and which mapping is doing it. Engineer it like this:

```
Bloom                       [Driven by Kick · +60% · AD 5/400ms]  0.25 -> 0.85
[=======(O)===================|--------------------------]
         ^                    ^
    Base thumb (0.25)    Influence ceiling (0.85)
         [~~~~~~~~~~~•~~~~~~~~]
                     ^ Live bouncing ghost dot (0.52)
```

- **Track floor:** neutral-2, ~4px tall.
- **Base fill and thumb:** neutral-8 — where the property rests when no mapping is contributing. This thumb is the property's own static value, and it is the only thing this slider directly edits.
- **Influence range bar:** from the base thumb toward the influence ceiling (or downward, for a negative influence), a ~2px bar in the *modulator's semantic colour* (pink for signal emitters, purple for automation lanes). The bar is a *display* of the mapping's influence, not a second editor: dragging it is not how influence changes.
- **Live ghost:** as the song plays, a bright neutral-9 dot/tick moves along the bar as the mapping's contribution rises and — for emitter mappings — falls back along the mapping's AD decay curve to the base. This single detail makes the whole interface feel alive.
- **Driven-by badge (replaces the old source pill):** next to the label, a read-mostly badge such as "Driven by Kick · −50% · AD 5/400ms". Hovering it highlights the Kick emitter lane in the Modulation tab; **clicking it jumps to that mapping's canonical editor in the modulator's Mappings list**, where influence and AD are actually edited. A negative influence (−50%) means the kick ducks the bloom *down* instead of boosting it — and that sign lives in the mapping, nowhere else.

#### Component physics: why the Post panel scrolls, in numbers

In the current Post panel each control costs ~64px (label row ~20px + gap ~8px + slider track ~16px + bottom margin ~20px), and the section helper prose ("Looks at the frame in 3D…", "Runs on the GPU over the whole frame…", "Texture that sits on top of everything.") permanently consumes ~120px more — which is why the panel needs a scrollbar before Scanlines. The fix:

- Move explanatory prose into a ~150ms-delayed hover tooltip on a subtle ? icon or the section header. It is great onboarding copy; after day one it is read zero times but paid for in pixels every day.
- Make each parameter row strictly **24–28px total**: label on the left 40% (12px, neutral-7, ellipsis), slider track + tabular numeric readout on the same horizontal axis in the right 60%.
- Result: all 7 Post controls (Orbit, Tilt, Distance, Bloom, Chromatic aberration, Warp, Scanlines) fit in ~240px of vertical height — **no scrollbar**.

#### The five golden micro-interaction mechanics

1. **Shift + drag = fine gear.** Holding Shift multiplies any slider/node/handle mouse delta by 0.1×, so Chromatic aberration can go 0.15 → 0.154 without fighting mouse sensitivity.
2. **Double-click (or Alt+click) resets to the identity value** — 0 for Orbit/Tilt, 1 for Distance, 100% for Opacity. Replace the full-width "Reset camera" button (which also reads as disabled at rest) with a tiny ↺ icon in the CAMERA section header for reset-all, and per-slider reset on double-click.
3. **Direct entry on numeric pills, with inline maths.** Clicking a value pill (0, 0.25, 0.15…) turns it into an inline input; typing `0.5` + Enter sets it — and, Figma/Blender-style, expressions like `*2`, `/2`, `+0.1` should just work.
4. **Infinite scrubbing via `requestPointerLock`.** When scrubbing a numeric pill horizontally, lock the pointer so the user doesn't run into the physical edge of their monitor mid-drag.
5. **Section bypass toggles.** A tiny 12×12 power/eye toggle at the far right of every section header (CAMERA, LENS, FILM) so users can A/B "with or without the Lens stack?" in one click, without zeroing Bloom, Chromatic aberration and Warp.

![Your Post panel — grouped sections (Camera / Lens / Film), one-line plain-English explainers, value pills on the right.](.src/media/post.jpg)

Your Post panel. Strong bones: grouped sections (Camera / Lens / Film), one-line plain-English explainers, value pills on the right.

### Anatomy of a perfect slider row

1. Label, left, in plain words.
2. Value, right, tabular, in a pill or field — **and typeable**. Clicking the value must allow exact entry.
3. Track with a filled portion showing position at a glance.
4. Thumb big enough to grab without aiming (14–18px), growing slightly on hover.
5. Drag = coarse, arrows = fine (one step), Shift+arrows or scroll = finer/coarser per your convention — and double-click resets to the default, with the default knowable.

### Inspector organisation

- Sections in cause order (Camera → Lens → Film is exactly right: geometry, optics, texture).
- Each section: title, one-line explainer, controls, and a reset for that section only.
- Driven properties wear their badge in the same row (Ch. 18) and their slider bounces live (Ch. 19).
- Long inspectors scroll internally; the layer’s name and type stay pinned at the top.

Chapter 26

## Floating pills versus docked panels: choosing honestly

Your top-right pills — Settings · Palette · Post · Export · Options — are attractive, and they hide a real trade-off you should make consciously.

|  | Floating pop-overs (current) | Docked panels |
| --- | --- | --- |
| Best for | Short visits: pick a format, flip a setting, leave | Long work: shaping a mapping's AD envelope, managing a modulator's Mappings list |
| Cost | Covers the preview; vanishes on outside click; state is easy to lose | Permanently spends screen space |
| Selection link | Weak — panel floats above whatever is selected | Strong — sits beside the preview, updates with selection |
| Comparing | Cannot compare two panels at once | Can pin and compare |

### The hybrid professionals settle on

- **Keep pills as doors, not rooms:** clicking Post opens the Post *section of the docked inspector* (or a pop-over the user can pin into a dock). The pill bar becomes navigation; the work happens in a stable place.
- **Pin-ability:** any pop-over gets a pin. Pinned = stays, docks, survives selection changes. This one affordance removes most pop-over frustration.
- **Dismissal rules:** Escape closes the topmost pop-over only; clicking the preview does not silently discard an in-progress edit — values apply live, so there is nothing to discard, and the panel says so by having no OK/Cancel.
- **One open at a time** among sibling pills (your current behaviour appears to be this — keep it), with the active pill visually pressed, as Post and Export already show.

Chapter 27

## Transport and export: the two moments of truth

![Your Export panel — the card-based format picker: Landscape 16:9, Vertical 9:16, Square 1:1, Portrait 4:5, each with where it is used.](.src/media/export.jpg)

Your Export panel — the card-based format picker is genuinely excellent design. Steal it for other choice-sets in the app.

### Transport (playback)

- Play/pause is the biggest, most stable target in the app and never moves. Your large left-rail play button understands this.
- Time, bar/beat and BPM sit together, tabular, with the current value dominant and the total quiet (“0:05.14 / 3:18.07” — yours does this well).
- Loop toggle, change-song, and zoom readouts each get one home; duplicates across bars will drift apart.

### Export: a checklist disguised as a panel

- **Choices as cards** when the choice is visual (format) — with platform hints under each, exactly as yours does.
- **Segmented controls** for short either/or lists (resolution, frame rate) — yours again. Selected segment in accent, full label always visible.
- **Consequences in plain words:** “60 fps is best effort on slower machines” is the gold standard — honest, specific, calm. Add the same honesty for file size (“about 180 MB”) when you can estimate it.
- **Locked states explain themselves** (“Locked while recording”) instead of just greying out.
- The final action is one unambiguous button with the outcome in its label (“Export video”), progress with cancel, and a success state that offers “Open file / folder” — never a dead end.

Part VIII · Chapter 28

## Motion, sound and performance feel

### Interface motion (not artwork motion)

- UI animation exists to explain change: a panel that slides shows where it came from; a number that counts shows direction. Anything else is decoration competing with the user’s own visualizer — keep UI motion under ~200ms, ease-out for entrances, and instant for anything the pointer is directly dragging.
- Nothing the user drags, scrubs or plays may ever wait for an animation to finish.
- Respect reduced-motion preferences for UI chrome (the exported artwork is the user’s choice; the tool’s chrome is yours).

### Sound in a sound tool

- Scrubbing should be audible (that is how editors find beats by ear) with a mute for scrub-audio specifically, separate from playback mute.
- Never let UI clicks/beeps compete with the song. In a music tool, the song is the only soundtrack.
- Sync is sacred: audio and playhead and preview share one clock. If they drift, stop and fix the clock before any other polish — users forgive ugly, they never forgive late.

### Performance feel checklist

- Playhead scrubbing at 60fps with a real project loaded
- Zoom and divider drags with no visible lag or repaint tearing
- Waveforms precomputed; opening a project never blocks the first frame
- Long operations (analysis, export) progressive, cancellable, and honest about progress
- Every interaction gives first feedback within one frame, completion whenever it completes

PART VIIIChapter 28 · Motion and performance

Part IX · Chapter 29

## Comfort and accessibility: designing for hour three

- **Eye strain:** primary text at tier-8, not peak white; no large pure-white or pure-saturated surfaces; the darkest tier reserved for void, not for text backgrounds you read for hours.
- **Contrast floors:** body text and values must pass standard contrast guidance against their actual tier background — test the real pairs (tier-7 on tier-2 is the one that usually fails) and promote the text a tier rather than shrinking from the standard.
- **Colour independence:** every meaning carried by colour also carried by shape, label or position (Ch. 8). Test by screenshotting in greyscale and re-reading the screen.
- **Targets and tremor:** generous hit areas (Ch. 6), drag thresholds that forgive a shaky start, and keyboard alternatives for every precision drag (arrow-key nudging with numeric readout).
- **Focus visibility:** keyboard focus gets a clear, peak-tier outline that is never the same style as selection, so “where am I tabbing” and “what did I select” never blur.
- **Session comfort:** remember panel sizes, zoom, and scroll per project; offer a slightly larger UI scale option — density should be a user choice, not a test of eyesight.
- **Photosensitivity care:** the tool’s own chrome never flashes; for artwork, a gentle warning path for extreme strobe exports is a kindness worth having before a platform flags a user’s video.

### Questions to ask — Chapters 28–29

- Use the app for two hours straight. What hurts — eyes, wrist, attention? That list outranks any feature request.
- In a greyscale screenshot, is every state still readable?
- Can I complete import → place emissions → create a mapping → export touching only the keyboard?

PART IXChapter 29 · Comfort and accessibility

Part X · Chapter 30

## Learnability: the first ten minutes decide everything

### The golden first run

1. **Land on a song-shaped invitation,** not an empty grid: one clear action (“Add your song”) in the empty timeline and preview.
2. **A 60-second win:** a bundled demo song + a pre-built kick signal emitter the user can immediately map to a glow teaches emitters, mappings and the AD envelope by touching, not reading.
3. **Progressive first session:** no tour, no modal slideshow. One contextual hint at a time, at the moment of need (“You placed your first emission — now map it to something”), each dismissible forever.

### Presets and templates: borrowed choreography

- **Mapping presets** (“Punch”, “Shimmer”, “Heartbeat” — Ch. 17) bundle modulator + influence + AD envelope (for emitter mappings) so beginners get a good fall before they can draw one.
- **Project templates** per destination (YouTube landscape, TikTok vertical) pre-set format, safe areas and a starter layer stack.
- Presets are starting points that fully reveal their settings — a preset whose values are hidden teaches nothing and traps everyone.

### Help that lives where the problem is

- Tooltips with name + shortcut + one-line why. Section explainers in your own voice (you already write these well). A searchable shortcut list inside the app. Error messages that link to the exact setting that fixes them.
- Vocabulary consistency is learnability: the word in the tooltip is the word in the menu is the word in the help. Pick VISUALIST's words — *signal emitter*, *emission*, *intensity*, *automation lane*, *mapping*, *influence* — and never also call an emitter a trigger or impulse in UI copy (industry synonyms can live in docs, mapped to VISUALIST's terms).

PART XChapter 30 · Learnability

Part XI · Chapter 31

## Audit of your current build

Based only on the three screenshots in this book — your wide editor view, the Post panel, and the Export panel. Anything not visible is marked as a question, not a verdict.

### Already genuinely strong — protect these

- **Dark neutral shell with a single violet accent** — the artwork pops, the chrome stays calm (Ch. 7–8, already passing).
- **Full-width docked timeline + overview minimap** — two professional decisions most first editors miss entirely.
- **Automation as a filled, readable lane** and tabular-style transport readouts (time / bar / BPM together).
- **Post panel structure:** grouped sections with plain-English explainers and per-section reset — textbook inspector writing.
- **Export format cards with platform hints** and honest lock/quality notes — the best-designed panel in the screenshots.
- **Preview selection handles with rotate stem** — pro-grade canvas behaviour, already present.

### Watch-outs, in the order I would fix them

1. **Mapping visibility (Ch. 18).** Nothing in the screenshots answers "what drives what?" Give driven properties a read-mostly badge ("Driven by Kick · −50% · AD 5/400ms") and give every modulator a Mappings list in the inspector. This is VISUALIST's core idea — it should be the most visible relationship in the app.
2. **Floating pills vs. a home for editing (Ch. 26).** Post/Export work as pop-overs because they are short visits, but mapping and AD-envelope editing will outgrow pop-overs. Add pinning, or let pills open a docked inspector section.
3. **The unemployed void beside the preview (Ch. 5).** A left dock (layers/assets) and the inspector on the right reclaim it and shrink the preview’s height demand.
4. **Two navigation systems (left icon rail + top pills).** Give each an exclusive job or merge them before users must learn both.
5. **Number language (Ch. 9).** 0–1 decimals (0.68, 0.25) sit beside counts and BPM. Decide per property family — decimals for normalised controls, percentages where users think in percentages — then apply it everywhere.
6. **Value entry.** Confirm every value pill is typeable and every slider double-click-resets; if not, that is a small build with an outsized premium feel.

7. **The mixed timeline hierarchy — resolved by the two-tab split, with new watch-outs.** The old single stack mixed the master song, orphaned automation, Post, layers and a second audio clip at one visual level (Ch. 12). The decided one-panel, two-tab architecture resolves that: layers alone in the Timeline tab, emitters and automation lanes alone in the Modulation tab, nothing nested. The watch-outs move with it — they are now the Chapter 11 safeguards: shared playhead/zoom/scroll/loop/selection across tabs, pinned master-audio and layer-presence reference rows in the Modulation tab, "modulated" indicators in the Timeline tab, and the stage staying visible in both tabs. If any one of those four slips, the split will feel like two separate apps instead of one panel.

Chapter 31 · continued

## Your next ten moves, sequenced

1. Add driven-by badges to properties + a Mappings list when a modulator lane is selected; the badge jumps to the mapping. (Ch. 18)
2. Make the one-shot AD envelope editable per mapping, in the mapping editor: two-segment graph + A ms / A curve / D ms / D curve. (Ch. 19)
3. Make driven sliders/values bounce live during playback and scrubbing. (Ch. 19)
4. Split the editor panel into its two tabs — Timeline (layers only) and Modulation (emitters + automation only) — with the four shared-state safeguards from Chapter 11 landing in the same pass, not after it.
5. Give the divider double-click reset, min/max limits, and per-project memory. (Ch. 4)
6. Introduce a collapsible left dock (layers/assets) into the preview’s side void. (Ch. 5)
7. Add pinning to the Post/Export pop-overs as the bridge to a docked inspector. (Ch. 26)
8. Audit all numbers for tabular figures and one decimal/percent language per family. (Ch. 9)
9. Add snap indicators + a visible snap toggle near the timeline. (Ch. 20)
10. Ship three mapping presets (Punch / Shimmer / Heartbeat) and a demo project. (Ch. 17, 30)

**What not to do next**Do not add more effects, more panels, or a node-graph view until moves 1–3 land. Your differentiator is not the number of effects — it is whether a user can *see and shape* how the song drives them. Visibility first, vocabulary second, variety third.

### Questions only you can answer

- Are value pills typeable today? Do sliders reset on double-click?
- Does the divider remember its position per project?
- When a property is driven, does anything on screen say so right now?
- Can a user export vertical without ever seeing a vertical safe-area guide?

Part XII · Chapter 32

## The master checklists

### Supplement — The designer's diagnostic framework: five tests for every feature

Tape these to your monitor. Run every new feature, effect or control through all five:

1. **The 2-second diagnostic test.** "If a user opens a project they haven't touched in 3 weeks and presses Play, can they tell within 2 seconds *which* audio element is causing the text to flash?" If not, the modulation routing lacks visual feedback on the canvas/inspector.
2. **The occlusion audit.** "When I open this panel or adjust this slider, does it cover a single pixel of the preview canvas or the timeline?" If yes — dock it.
3. **The scrollbar shame test.** "Does my inspector panel require vertical scrolling for a standard 6–10 parameter effect?" If yes, vertical padding is too loose, labels are stacked instead of inline, or tutorial prose is eating control space.
4. **The click-count tax.** "How many clicks does it take to map the Kick emitter to Camera Distance?" Target: a short creation flow from the modulator's Mappings list, or one drag shortcut that creates the mapping there. Dropdown → submenu → submenu means redesign it.
5. **The mute/solo sanity check.** "Can the user instantly bypass/mute a single emitter lane, a single mapping, or the entire post-processing stack with one click to hear/see the difference?"

### Supplement — Svelte 5 + WebGL: the two-speed performance architecture

You have a real performance advantage building in Svelte 5 and WebGL — *if* you separate the 60fps signal thread from the DOM reactivity thread. Never store the 60fps `currentTime` playhead or the live FFT array in a global `$state` rune: if 50 timeline components and 20 inspector sliders re-evaluate 60 times a second, layout recalculation eats the 16.6ms frame budget and the visualizer drops frames.

- **Tier 1 — Structural & configuration state (Svelte 5 runes, `$state` / `$derived`):** layer lanes, clips, emissions (positions/intensities), automation points, static base values, mappings, active selection. These change only when the user clicks or drags.
- **Tier 2 — High-frequency signal bus (TypedArrays + direct mutation):** an AudioWorklet or AnalyserNode computes the FFT spectrum and evaluates mappings' AD envelopes into a pre-allocated `Float32Array` every frame. The WebGL renderer reads directly from that array in its `requestAnimationFrame` loop — zero garbage collection, zero Svelte overhead. The playhead line and live bouncing slider dots update via a lightweight rAF subscriber writing directly to `element.style.transform = translate3d(${x}px, 0, 0)` or a scoped CSS custom property (`--live-mod-val`), completely bypassing DOM diffing.

```ts
export type ModulatorTypeT = 'signalEmitter' | 'automationLane'

// The mapping is a first-class entity: it owns target, signed influence,
// and — only for signalEmitter sources — the one-shot AD envelope.
export type MappingT = {
  id: string
  modulatorId: string
  targetLayerId: string | 'post'   // a layer, or a post/global property
  targetParamKey: string
  influence: number        // signed; sign and magnitude live ONLY here
  // Present only when the modulator is a signal emitter. No hold, no
  // sustain, no release; decay always ends at exactly 0 gain.
  envelope?: {
    attackMs: number
    attackCurve: number    // -1.0 (log) to 1.0 (exp)
    decayMs: number
    decayCurve: number     // -1.0 (log) to 1.0 (exp)
  }
}

export type EmissionT = {
  id: string
  timeSeconds: number
  intensity: number        // 0 to 100
}

export type AutomationPointT = {
  id: string
  timeSeconds: number
  valuePercent: number     // 0 to 100 — pure potential, nothing else
  curvatureToNext: number
}
```

**Hybrid timeline rendering:** render left track headers as standard Svelte HTML/CSS (accessibility, truncation, hover buttons, drag-to-reorder all come free) — but render waveforms, grid lines, emitter intensity stalks and automation curves in the data area onto a virtualised `<canvas>` layer (or per-track canvases with one shared ResizeObserver), with an invisible SVG/pointer hit-testing layer on top. Two hundred DOM nodes per track will bog down zooming and panning; a canvas redraw at a new pixelsPerSecond multiplier takes under a millisecond.

### Before building any new panel

- What is its one job, in one sentence?
- Does that job already have a home? If yes, extend that home.
- What is selected when it opens, and how does it show that?
- Can it be dismissed without losing work? Can it be pinned?
- Does it still work at the smallest supported window?

### Before shipping any new control

- All five states designed (rest, hover, active, focused, disabled + reason)?
- Keyboard-operable, with the shortcut shown in its tooltip?
- Value typeable where numeric, resettable to a knowable default?
- Undoable? Autosaved? Named the same everywhere it appears?

### Before calling a screen “done”

- Squint test passed (Ch. 22)? Greyscale test passed (Ch. 29)?
- Peak-tier objects counted — one or two, not nine? (Ch. 7)
- Numbers tabular, aligned, one language per family? (Ch. 9)
- Empty, loading, error and nothing-selected states all designed? (Ch. 23)
- A stranger can state what drives what in under three seconds? (Ch. 18)

### Suggested build order for a v2 interface pass

**Pass 1 — Truth:** driven-by badges, Mappings lists, live bouncing, the per-mapping one-shot AD envelope editor, the two-tab panel split with its four safeguards. **Pass 2 — Space:** left dock, pop-over pinning, divider memory. **Pass 3 — Polish:** tabular audit, snap indicators, cursors, tooltips with shortcuts. **Pass 4 — Welcome:** demo project, mapping presets, first-run hints. Each pass is shippable alone and makes the next one easier.

PART XIIChapter 32 · Checklists

Chapter 33

## Glossary and pattern index

### Supplement — The seven urgent changes (do these before building further)

Drawn directly from the current screenshots and the Zest design-system docs — the highest-leverage fixes, in order:

1. **Dock Settings, Palette, Post and Export into the empty right wing.** Right now Post/Export open as long floating cards covering the right side of the timeline, while the top-right ~35% of the screen beside the preview is empty black void. A permanent ~300px Right Inspector Dock above the timeline split line keeps the timeline 100% visible at all times, and the preview barely changes size.
2. **Convert the Post sliders to compact single-row scrubbers and strip the helper prose** to tooltips; label + slider on one ~26px row; the full-width Reset camera button becomes a ↺ icon inside the CAMERA header (see Chapter 25 supplement for the numbers).
3. **Move aspect-ratio selection into the preview toolbar, next to Fit — and add a primary Export CTA.** The format cards (Landscape 16:9, Vertical 9:16, Square 1:1, Portrait 4:5) look great, but aspect ratio is not just an export setting: it changes how the user composes text and layers from minute one. Also add a prominent primary "Export Video / Render" button to the Export panel — the settings are there, but no obvious primary action is.
4. **Split the editor panel into its two tabs and end the mixed hierarchy.** Layers alone in the Timeline tab; signal emitters and automation lanes alone in the Modulation tab; nothing nested under a layer. In the Modulation tab, pin the master audio (`misbehave.mp3`) and the layer-presence strip as reference rows at the top while modulator lanes scroll beneath them (see Chapter 11).
5. **Print bar and beat numbers on the timeline ruler** — 10px tabular numerals at every major division (see Chapter 11 supplement).
6. **Build the signal emitter lane and the mapping UI next.** The one-row emitter lane (click on the beat grid, or Auto-Detect Kicks/Transients) plus each modulator's Mappings list and the driven-by badges on Post and layer properties is the highest-leverage feature work remaining — it is the product's core idea, made visible.
7. **Neutralise the olive/green tint in neutral 1–5 for the editor workspace.** Keep the warm Zest ramp for documentation; strip the green/olive chroma in the workspace so purple automation, pink emitter markers and the WebGL canvas read twice as crisp (see Chapter 7 supplement).

|  |  |
| --- | --- |
| **One-shot AD envelope** | VISUALIST's only envelope: attack ramps gain to peak over A ms, decay immediately falls over D ms to exactly 0 gain. No hold, no sustain, no release. Owned by a mapping, emitter sources only (Ch. 19). |
| **Signal emitter** | A modulator lane of point emissions, each with intensity 0–100 (Ch. 16). |
| **Automation lane** | A modulator lane holding only a 0–100% value curve (points + per-segment curvature) across the whole project. Pure normalised potential: no target, sign or impact (Ch. 13, 15). |
| **Mapping** | The first-class entity connecting a modulator to a property. Owns target, signed influence, and the AD envelope for emitter sources (Ch. 18). |
| **Influence** | The signed amount a mapping applies: how much of a property change a 100% modulator signal produces, and in which direction (Ch. 18). |
| **Clamp** | A property's own minimum and maximum, applied after all mapping contributions sum (Ch. 1, 18). |
| **Dock** | A panel attached to a window edge, sharing space by squeezing siblings (Ch. 4–5). |
| **Minimap / overview** | A whole-project miniature with a viewport lens for navigation (Ch. 11). |
| **Onset / transient** | The attack moment of a sound; detected onsets become ticks, snaps and proposed emissions (Ch. 14, 17). |
| **Quantise** | Moving events to the nearest grid position (beat, bar, transient) (Ch. 16). |
| **Spectrogram** | Time × frequency heat-map view of audio (Ch. 14). |
| **Tabular numerals** | Fixed-width digits that prevent layout jitter in changing numbers (Ch. 9). |
| **Token** | A named, reusable design value (colour tier, spacing step, radius) (Ch. 6–7). |
| **Intensity** | An emission's strength, 0–100, drawn as stalk height + brightness (Ch. 16). (Industry tools call the cousin concept velocity; VISUALIST says intensity.) |

### Pattern index — where to find each pattern fast

Squeeze layout · Ch. 4Three-pane top · Ch. 5Surface tiers · Ch. 7Automation lanes (Modulation tab only) · Ch. 13Intensity strip · Ch. 16Threshold-over-waveform · Ch. 17Mapping: Mappings list + driven-by badge · Ch. 18One-shot AD envelope editor (on the mapping) · Ch. 19Live bouncing values · Ch. 19Hover banding · Ch. 12Pin-able pop-over · Ch. 26Format cards · Ch. 27

**Last word.** Your screenshots already show the instincts this book formalises: calm surfaces, honest labels, a timeline taken seriously, and an export panel that respects the user. The gap between where you are and “premium” is not taste — you have that. It is visibility: of mappings, of envelopes, of state. Make the invisible choreography visible, and the app will feel the way your visualizers look.

Keep Chapters 18, 19, 31 and 32 open while you build.

---

## What was added in this edition

This Markdown edition contains the complete PDF book, plus the following material that was in the supplied notes but **not** in the PDF. Each item was merged into the chapter it belongs to, under a **Supplement** heading:

1. The opening framing quote — web designer → systems engineer; the app as "a specialized heads-up display for data manipulation" (before Chapter 1).
2. The exact 4-step grayscale hex stack (`#000000` / `#0c0c0c` / `#1a1a1a` / `#2a2a2a`), the squeeze implementation mechanics (100vh/100vw root, `overflow: hidden`, flex-grow/flex-basis, `height: calc(100vh - timelineHeight)`, `object-fit: contain`, the z-index overlay warning, the Scrollbar Trap), and preview viewport zooming (Fit vs. 100%/200%/400% with panning) — Chapter 4.
3. The signal equation with every variable defined, the "live diagnostic oscilloscope" framing, the four-paradigm intersection, and the extended lexicon (docking tree / binary space partitioning, scrubby sliders, bipolar vs. unipolar, ghost thumb, envelope follower / slew limiter, hysteresis & Schmitt triggering, coordinate space transforms, semantic zooming, Fitts's law & infinite edges, spatial memory) — Chapter 1. (The equation itself was rewritten in the latest revision into the three-layer Modulator → Mapping → Property form; see "What changed in this revision" below.)
4. The canonical 4-zone split-grid ASCII layout diagram, the ~35%-empty-wings maths, and the pills becoming the Right Dock's tab header — Chapter 5.
5. Emitter anatomy: the 2px intensity stalk (drag the top cap, `ns-resize`; ghost note ~25 vs. accent 100), the translucent decay ghost tail, visible 600ms tail overlaps, and Auto-Detect Kicks/Transients — Chapter 16.
6. The envelope shaper UI (~120 × 60px graph) and per-effect physics (text scale/camera shake, glow/bloom, flash/invert) — Chapter 19. (Superseded in the latest revision: the graph now carries only the one-shot AD parameters — A ms, A curve, D ms, D curve.)
7. Low-menu mapping creation workflows — Chapter 18. (Reworked in the latest revision: creation shortcuts may create a mapping, but every mapping lives in the modulator's Mappings list, its one canonical editor.)
8. The reactive dual-value slider engineered in ~28px (base thumb, influence range bar in the modulator colour, live bouncing ghost dot, influence ceiling, driven-by badge with negative-influence ducking) — Chapter 25.
9. Component physics: ~64px-per-control + ~120px of prose = the Post panel scrollbar; compression to 24–28px single rows (label left 40%, slider + tabular readout right 60%) so all 7 controls fit in ~240px; prose moved to tooltips — Chapter 25.
10. The five golden micro-interaction mechanics: Shift+drag 0.1× fine gear; double-click / Alt+click reset to identity; direct entry on numeric pills with inline maths (`*2`, `/2`, `+0.1`); infinite scrubbing via `requestPointerLock`; section bypass toggles and the ↺ section-header reset — Chapter 25.
11. Timeline hierarchy: colour-coding by domain, the specific current-build confusion (`misbehave.mp3` under AUTOMATION, orphaned "Reacti… 0.68", Camera distance above Post) — Chapter 12. (Superseded in the latest revision: no nested child lanes at all — the two-tab split replaces tree indentation, and the Modulation tab pins master audio + layer-presence reference rows.)
12. Musical time: bar numbers printed on the ruler in 10px tabular numerals, downbeat vs. beat grid lines, magnetic snapping to 1/16 or 1/8 with Alt/Cmd bypass; thinking in 3.3.1, not 0:05.14 — Chapter 11.
13. Zest design-system traps: the token naming inversion (`--color-primary-*` pink / `--color-secondary-*` purple → rename to `--color-pink-*` / `--color-purple-*`); the green/sage/olive chroma in neutral steps 3–8 and the Bezold–Brücke / Chevreul simultaneous-contrast fix (chroma 0.000–0.003 toward cool slate H ≈ 260 for neutral 0–5); micro-density tokens (`--spacing-px`, `--spacing-3xs`, `--radius-xs`, `--radius-2xs`) — Chapters 6, 7 and 8.
14. Svelte 5 + WebGL two-speed performance architecture (Tier 1 `$state`/`$derived` structural state; Tier 2 Float32Array signal bus via AudioWorklet/AnalyserNode, direct `translate3d` / `--live-mod-val` updates, the 16.6ms frame budget), the TypeScript types (rewritten in the latest revision as `ModulatorTypeT`, `MappingT`, `EmissionT`, `AutomationPointT`), and hybrid DOM-headers + canvas-lanes timeline rendering — Chapter 32.
15. The five designer diagnostic tests (2-second diagnostic, occlusion audit, scrollbar shame, click-count tax, mute/solo sanity check) — Chapter 32.
16. The seven urgent changes list (dock the pills right; compact Post scrubbers; aspect ratio into the preview toolbar + a primary Export Video CTA; split the panel into two tabs + pin master/presence reference rows; print bar/beat numbers; build the signal emitter lane + mapping UI next; neutralise the olive tint in neutral 1–5) — Chapter 33.
17. Smaller details woven in where they belong: "Echoes amount / Echoes speed / Warp" as the equal-padding example and the 1–2px clip-radii rule (Chapter 13); the 15-tracks-on-1080p Micro target and header micro-numbers (Chapter 12); white-text burn (Chapter 7); hover row banding neutral-1 → neutral-2 and the full cursor table (Chapter 20); the minimap placement choice — above the tracks vs. at the bottom (Chapter 11); the spectrogram rationale, isolating hats vs. 808s (Chapter 14).


---

## A note before this revision — my take on the new direction

You asked me to speak up before writing this draft if I thought the new direction was not good. Here is my honest answer: **I endorse the two-tab split, and I think it is better than what this book previously recommended.** Earlier editions (following your screenshots) treated layers, automation and impulses as lanes in one timeline, with automation nested or overlaid under layers. Your spec replaces that with something cleaner, and this revision follows your spec wherever the two disagreed.

**Why I think it works.** Each tab ends up with one kind of thing per lane and one verb: the Timeline tab is for *arranging* layers in time and stack order, the Modulation tab is for *animating* properties. Nobody has to expand a layer to find its curves, nobody has to guess which parent an orphaned lane belongs to, and an automation lane can be understood on its own terms — as pure potential — without a layer's property units getting in the way. The mapping being a first-class third entity is what makes the separation honest: the connection has a real home instead of being smeared across two lanes.

**The risks are real, though — they are just manageable.** I see three:

- **Invisible connections.** The thing that drives a layer now lives in a different tab from the layer itself. Left alone, a user will stare at a flashing text layer in the Timeline tab with no idea why it flashes.
- **Wrong-moment mappings.** In the Modulation tab you can happily map a kick to a layer that is not on stage at that moment, and the mapping will look broken when it is actually just early or late.
- **Tab-switch friction.** If switching tabs loses your place — playhead, zoom, scroll, selection — users will stop switching, and whichever tab they live in becomes the "real" app while the other rots.

**The mitigations are the safeguards, and they are not optional garnish.** Shared playhead, timebase, zoom, horizontal scroll, loop region and selection across both tabs, so switching never resets the view. Pinned reference rows in the Modulation tab — the master audio waveform and a thin read-only layer-presence strip — so you can always see *when a layer exists* while you map to it. A "modulated" indicator on layers in the Timeline tab, plus driven-by badges on properties that jump straight to the mapping, so animation is discoverable from the layer side. And the stage preview visible above the panel in both tabs, with a selected mapping highlighting its target layer. Build those four in the same pass as the tabs themselves, not as a later polish round, and I believe the split will feel like one instrument with two views — which is what it is.

One more word in its favour: the corrected envelope makes the whole system easier to reason about, not just more accurate. A one-shot AD on the mapping — attack to peak, decay immediately to exactly 0, no sustain, no release, nothing hidden — is something a beginner can hold in their head in one sentence. That simplicity is worth protecting as you build.

---

## What changed in this revision

This revision folds your formal VISUALIST spec and your corrected envelope into the book. The foundations, visual system, micro-interactions, diagnostics and most of the audit stand as they were; what follows is everything that changed, so you can check the book against your spec item by item.

### The five headline changes

- **ADSR corrected to a one-shot AD envelope.** All ADSR, hold, sustain and release material describing VISUALIST's envelope has been removed and replaced. The settled spec: an emission is an instant point event (intensity 0–100); the mapping's envelope ramps gain from 0 to peak over A ms (attack curve), then decay begins immediately at the peak and falls over D ms (decay curve) to exactly 0 gain — ending at 0 is a law, not a setting. Peak gain = the mapping's influence × (emission intensity ÷ 100). The envelope has exactly four parameters: A ms, A curve, D ms, D curve. Modelled on Pigments 1-shot mode. See Chapter 19.
- **The retrigger/overlap rule is now specified.** Each emission spawns an independent envelope instance; simultaneous instances from the same mapping sum, and the mapping's total envelope gain is clamped to 1.0 (100% of influence), so fast rolls saturate gracefully and a new hit never chops the previous tail to zero. See the boxed note in Chapter 19.
- **The mapping is a first-class third entity, with a decided UX home.** Data model: Modulator → Mapping → Property. The mapping owns the target, the signed influence (sign and magnitude live only here), and, for emitter sources only, the AD envelope. Its canonical editor lives on the modulator's side — the Mappings list shown in the inspector when a lane is selected in the Modulation tab, also reachable from the lane's options. The property side carries only a read-mostly badge (for example, "Driven by Kick · −50% · AD 5/400ms") that jumps to the mapping when clicked. Drag-to-map survives only as a creation shortcut that files the new mapping in that list. See Chapter 18.
- **Automation lanes are pure normalised potential.** An automation lane knows only its own 0–100% value over time (points + per-segment curvature, across the whole project). It does not know property units, sign, direction or impact. Both modulator types output a normalised 0–1 signal — an emitter via its mapping's AD envelope, an automation lane via its curve value directly — and automation mappings have no envelope. The signal equation in Chapter 1 was rewritten into this three-layer form (Source → Mapping → Property delta, summed and clamped).
- **One editor panel, two tabs.** The layout, timeline and audit chapters now describe a single bottom-docked editor panel with a Timeline tab (layer lanes only: staging, clips, z-order, in/out) and a Modulation tab (signal emitter lanes + automation lanes only). Layers no longer nest automation lanes anywhere in this book, and the rationale is stated in Chapter 11: eight layers × several properties each would mean dozens of sublanes to parse; separation gives each tab one kind of lane and one verb (arrange vs. animate). The four safeguards are written as requirements: shared playhead/timebase/zoom/scroll/loop/selection across tabs; pinned master-audio waveform + read-only layer-presence reference rows in the Modulation tab; "modulated" indicators in the Timeline tab and driven-by badges in the inspector; the stage preview visible in both tabs, with a selected mapping highlighting its target layer. Chapter 31's audit now records the old mixed/nested hierarchy criticism as resolved by this split, with the safeguards as the new watch-outs.

### How the rest of your spec now reads in the book

- **Two editors, one panel.** VISUALIST has a timeline editor and a modulation editor, living as the two tabs of the singular editor panel — not two separate panels, and not one mixed timeline. See Chapters 11 and 12.
- **Layers are staged and stacked.** A layer is a physical asset that can be positioned in the visualisation, chronologically staged (its start and end adjusted in the Timeline tab), and adjusted as an individual asset. Each layer has an index in the layer stack: it may sit behind one layer and in front of another (z-order). See Chapters 11–13 and the spec summary below.
- **Five layer types.** Layers can be audio, video, gif, image, or text. See the layer property matrix below.
- **Audio layers have no visual properties.** All layer types except audio exist visually in the stage. Audio therefore has no position, scale, rotation, opacity or any display-related properties, and its inspector must not show greyed-out visual controls — it shows volume and fade times only.
- **Text layer properties.** Font family, colour, font style(s), font weight, and text properties.
- **Video layer properties.** A volume property, audio fade-in and audio fade-out properties, and separate fade-in/fade-out properties for the video itself, visually. The audio fades and the visual fades are distinct controls and must be labelled distinctly, or users will fade the wrong thing.
- **Audio layer properties.** A volume property, and fade-in and fade-out time properties.
- **Inspector values are static.** The values adjusted in the inspector panel are a layer's static base values. Nothing in the inspector is, by itself, dynamic; dynamics exist only when a mapping connects a modulator to a property.
- **Multiple mappings, summed.** Other modulators and other signal emitters may be mapped to, and influence, the same property at the same time. Contributions sum, and the property's own range clamps the result.
- **Negative influence.** Modulation and signals can have a net negative influence: the higher the modulator's signal goes, the further the property is pushed *down*, by the amount and sign set in the mapping.
- **Post-processing is a valid target.** A mapping's target may be a post/global property — for example, an automation lane mapped to the post-processing bloom value, so the amount of bloom at any moment is controlled through the mapping's influence.

### The VISUALIST model, in one place

| Concept | What it knows | What it never knows |
| --- | --- | --- |
| Signal emitter lane | Its emissions: a time and an intensity, 0–100, for each | Targets, sign, impact |
| Automation lane | Its value: 0–100% at every moment, points + curvature | Targets, sign, impact, property units |
| Mapping | Target property, signed influence, AD envelope (emitter sources only) | — it is the connector |
| Property | Its static base value and its legal range | Modulators, influence, envelopes |
| Layer (audio) | Volume, fade-in time, fade-out time | Any visual/stage property |
| Layer (video) | Stage properties, volume, audio fades, visual fades | — |
| Layer (gif / image) | Stage properties (position, scale, rotation, opacity, display) | — |
| Layer (text) | Stage properties, plus font family, colour, font style(s), weight, text properties | — |

### Terminology

Throughout the book, VISUALIST's own model is now described in VISUALIST's words: **VISUALIST**, **signal emitter** (intensity 0–100), **emission**, **automation lane** (value 0–100%), **mapping**, and **influence**. Industry terms (velocity, depth, impulse) remain only where a section is explicitly about industry vocabulary, and there they are mapped back to VISUALIST's terms.
