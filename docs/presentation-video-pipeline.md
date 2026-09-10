# Manimate — Video Generation Pipeline

## Pipeline Overview

The core of Manimate is a 6-stage sequential pipeline orchestrated by `runPipeline()`. Each stage updates job metadata on disk, enabling real-time frontend monitoring.

```
Topic Input → [Web Research] → [Lecture Planning] → [Code Generation] 
           → [Rendering + Self-Correction] → [Voiceover + Muxing] 
           → [Final Stitching] → video.mp4
```

---

## Stage 1: Web Research

**Weight: 5%** | **Source**: `webResearch.ts` | **API**: Tavily Search

- Grounds lecture content in factual, up-to-date information
- Queries Tavily API with: `"{topic} key facts overview reliable educational sources"`
- Configurable depth (`TAVILY_SEARCH_DEPTH`) and max results (`TAVILY_MAX_RESULTS`, default 5)
- Returns compacted context (URLs + snippets) capped at 5,000 characters
- Can be disabled via `MANIMATE_WEBSEARCH=0` for offline operation
- Returns `null` if no Tavily API key is configured

---

## Stage 2: Lecture Planning

**Weight: 15%** | **Source**: `llm.ts` → `generateLecturePlan()` | **Prompt**: `PLANNER_PROMPT`

- LLM acts as "expert instructional designer and Manim scene planner"
- Generates structured JSON: `{ title, summary, modules: [{ title, description, scenes: [{ title, description, voiceover, visualElements, animations, cameraDirection }] }] }`
- Depth levels control module count:
  - **brief**: 1–2 modules
  - **normal**: 2–3 modules
  - **deep**: 3–4 modules

### Dynamic Scene Duration Recalculation

LLM-estimated durations are overridden for real-time accuracy:

```
spokenDuration = Math.ceil(voiceover.length / 15) + 3
scene.durationSeconds = Math.max(5, Math.min(45, spokenDuration))
```

- **~15 chars/sec**: Average English speaking rate
- **+3s buffer**: Visual transition + absorption time
- **Clamped 5–45s**: Prevents frozen frames or cut-off narration

---

## Stage 3: Code Generation

**Weight: 20%** | **Source**: `llm.ts` → `generateManimForModule()` | **Prompt**: `MANIM_PROMPT`

- For each module, LLM generates Python Manim code for every scene
- **Constrained API subset** — explicit allowlist in the prompt:
  - **Mobjects**: Text, MathTex, Circle, Arc, Rectangle, Line, Arrow, VGroup, Axes, NumberPlane, Dot, Square, Polygon, Triangle, ParametricFunction, Angle, Brace, Table, Matrix
  - **Animations**: FadeIn, FadeOut, Write, Create, Transform, ReplacementTransform, Rotate, ScaleInPlace, MoveAlongPath, Indicate, Flash, Circumscribe, Uncreate, Unwrite
- **Strict rules**: No raw mobjects in `self.play()` — must wrap in animation objects. No illegal kwargs in shape constructors. No 3D features. LaTeX double-backslash escaping.
- Code saved to `generations/{jobId}/scene_code/module_{i}_{sceneId}.py`

### Scene Matching Logic

Generated scenes are matched back to planned scenes using:
1. Exact ID match → 2. Prefix match → 3. Index-order fallback

---

## Stage 4: Rendering & Self-Correction Loop

**Weight: 35%** | **Source**: `manim.ts` → `renderSceneWithCorrections()`

This is the most computationally intensive stage.

### Rendering

```bash
python -m manim -qh --media_dir <mediaDir> <pyFile> <className>
```

- Resolution flag: `-qh` (high quality, 1080p)
- Python env: resolved from `MANIM_PYTHON` env var or defaults to `manim-env/Scripts/python.exe`
- Output: Finds newest `.mp4` in the media directory after successful compilation

### Self-Correction Loop

```
┌──────────────────────────────┐
│   Compile scene with Manim   │
└──────────┬───────────────────┘
           │
    ┌──────▼──────┐
    │  Success?   │
    └──┬──────┬───┘
       │      │
       ▼      ▼ (No)
   Done   ┌────────────────────────┐
          │  Capture error trace   │
          └───────────┬────────────┘
                      ▼
          ┌────────────────────────┐
          │  LLM correctManimCode  │  ← Up to maxAttempts (default 3)
          │  (broken code + error  │
          │   traceback + scene    │
          │   plan → fixed code)   │
          └───────────┬────────────┘
                      ▼
          ┌────────────────────────┐
          │  Rewrite .py, retry    │
          └────────────────────────┘
```

### Correction Prompt Domain Knowledge (`CORRECTION_PROMPT`)

Encodes common Manim error patterns:
- **NameError**: Illegal class name or typo
- **AttributeError**: Calling methods that don't exist on the mobject type
- **TypeError**: Passing raw mobjects to `self.play()` instead of animation objects (e.g., `self.play(circle)` → `self.play(FadeIn(circle))`)
- **Illegal kwargs**: `dash_length`/`dash_spacing` not allowed in `set_stroke()` — use `DashedVMobject` instead
- **Container methods**: `.get_start()`/`.get_end()` only work on primitive VMobjects, not VGroup or DashedVMobject
- **Minimal fix**: Apply only the necessary changes, don't rewrite entire scene

### Empirical Results (from thesis)

| Metric | Value |
|---|---|
| Total scenes generated | 100 |
| Scenes with initial compile errors | 44 (44%) |
| Successfully corrected | 41/44 (93.2%) |
| Failed after max retries | 3 (3.0% overall) |

---

## Stage 5: Voiceover & Muxing

**Weight: 15%** | **Sources**: `tts.ts` (Kokoro) + `video.ts` (FFmpeg muxing)

### TTS Synthesis

- **Model**: `onnx-community/Kokoro-82M-v1.0-ONNX` (82M params, q8 quantized)
- **Runtime**: ONNX — runs locally on CPU (configurable to GPU)
- **Voice**: Default `af_heart`, configurable via `KOKORO_VOICE` env var
- **Output**: 24kHz WAV files at `generations/{jobId}/tts/module_{i}_{sceneId}.wav`
- **Loading**: Lazy singleton — model loaded on first call, cached for subsequent scenes
- Can be skipped entirely via `skip_voiceovers` flag

### A/V Duration Alignment

Three strategies for handling mismatched audio/video lengths:

| Case | Strategy | FFmpeg Filter |
|---|---|---|
| Audio > Video | Freeze last frame | `-vf tpad=stop_mode=clone:stop_duration=<pad>` |
| Video > Audio | Pad with silence | `-af apad=pad_dur=<pad>` |
| Perfect match | Direct copy | `-c copy` video, encode audio |

Prevents: narration cut off mid-sentence, empty audio gaps, frozen screens during silence.

---

## Stage 6: Final Stitching

**Weight: 10%** | **Source**: `video.ts` → `stitchFinal()`

Two-pass concatenation using FFmpeg concat demuxer:

```
Pass 1: Per Module
  scene_1.mp4 + scene_2.mp4 + ... → module_N_full.mp4

Pass 2: Final Merge
  module_0_full.mp4 + module_1_full.mp4 + ... → video.mp4
```

- Uses concat demuxer with file list (`-f concat -safe 0 -i concat_list.txt -c copy`)
- `-c copy`: Stream copy mode — no re-encoding, preserves quality, fast
- Final output: `generations/{jobId}/video.mp4`

---

## End-to-End Data Flow

```
User: Topic "Fourier Transform" + Depth "normal"

Stage 1: Web Research
  → Tavily API → "Fourier Transform... key concepts, applications..."
  → Context saved to metadata

Stage 2: Lecture Planning
  → LLM generates 2 modules:
    Module 1: "What is Fourier Transform?" (3 scenes)
    Module 2: "Applications in Signal Processing" (2 scenes)
  → Dynamic duration: voiceover "17 chars" → ceil(17/15)+3 = 5s min
  → Saved as lecture_plan.json

Stage 3: Code Generation
  → LLM generates 5 Python Manim scripts
  → Scene 1: Sine wave animation using ParametricFunction
  → Scene 2: Frequency domain visualization with Axes
  → Saved to scene_code/

Stage 4: Rendering
  → manim -qh scene_1.py → Compile error: AttributeError
  → LLM correction: fix .get_start() on VGroup
  → manim -qh scene_1.py → Success → media/scene_1.mp4
  → [Repeat for all 5 scenes, 2 corrections total]

Stage 5: Voiceover
  → Kokoro TTS: "Fourier transform decomposes signals..."
  → FFmpeg mux: scene_1.mp4 + scene_1.wav → voiceover_videos/scene_1.mp4
  → Duration alignment: audio 12s > video 8s, freeze last frame for 4s
  → [Repeat for all 5 scenes]

Stage 6: Stitching
  → Concat Module 1: scene 1+2+3 → module_0_full.mp4
  → Concat Module 2: scene 4+5 → module_1_full.mp4
  → Concat: module_0 + module_1 → video.mp4

Output: generations/{uuid}/video.mp4 ✓
```

---

## Output Directory Structure

```
generations/{uuid}/
├── metadata.json           # Job state, progress, timestamps
├── lecture_plan.json       # LLM-generated plan
├── quiz.json               # Mastery quiz questions
├── video.mp4               # Final lecture video
├── scene_code/             # Python Manim scripts
│   ├── module_0_scene_0.py
│   ├── module_0_scene_1.py
│   └── ...
├── media/                  # Manim render outputs
│   ├── scenes/
│   │   ├── Scene1_480p15.mp4
│   │   └── ...
├── tts/                    # TTS voiceover WAVs
│   ├── module_0_scene_0.wav
│   └── ...
└── voiceover_videos/       # Muxed scene clips
    ├── module_0_scene_0.mp4
    └── ...
```

---

## Key Design Decisions

1. **Sequential pipeline**: Stages depend on previous outputs — no parallelism across stages, but scenes within stages are processed iteratively
2. **Self-correction loop**: 93.2% success rate on initial failures — domain-specific prompts are critical for reliability
3. **A/V duration alignment**: Freeze-frame and silence padding handle the common case where narration and animation lengths don't match
4. **No re-encoding stitch**: `-c copy` in concat demuxer preserves quality and is fast
5. **Dynamic duration**: Prevents LLM from setting unrealistic scene timings — real voiceover length drives pacing
