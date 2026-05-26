# Video Generation Pipeline

This document details the video generation pipeline of Manimate Uni. The pipeline orchestrates web research, AI lecture planning, dynamic timing adjustments, code generation, compiling, self-correction, speech synthesis, and video stitching.

---

## 1. Pipeline Orchestrator

The entire sequence is coordinated by the [runPipeline()](file:///E:/programming/manimate-uni/src/lib/manimate/pipeline.ts#L91-L318) function inside the orchestrator library. It runs in a background thread and transitions the job through six distinct sequential stages.

---

## 2. Pipeline Stages

### Stage 1: Web Research (`web_research`)
- **Objective**: Collects factual, up-to-date information on the user-requested topic to serve as context for the planner.
- **Implementation**: [fetchWebResearch()](file:///E:/programming/manimate-uni/src/lib/manimate/webResearch.ts#L3-L29)
- **Workflow**:
  1. Checks the `MANIMATE_WEBSEARCH` environment flag (default is `true`). If disabled, this stage is skipped.
  2. Requires a `TAVILY_API_KEY` configured in the `.env.local` file.
  3. Sends a POST request to Tavily's Search API with search configuration parameters:
     - `search_depth`: Configured by `TAVILY_SEARCH_DEPTH` (default: `'advanced'`).
     - `max_results`: Configured by `TAVILY_MAX_RESULTS` (default: `5`).
     - `query`: `${topic} key facts overview reliable educational sources`.
  4. Parses the search output and returns a compacted context summary consisting of URLs and content snippets (up to 5,000 characters).

### Stage 2: Lecture Planning (`lecture_planning`)
- **Objective**: Generates a structured plan outlining modules, scene concepts, and narration transcripts.
- **Implementation**: [generateLecturePlan()](file:///E:/programming/manimate-uni/src/lib/manimate/llm.ts#L133-L150)
- **Workflow**:
  1. Resolves the selected LLM provider and model.
  2. Prompts the LLM with `PLANNER_PROMPT` (from [prompts.ts](file:///E:/programming/manimate-uni/src/lib/manimate/prompts.ts)), passing the topic, desired topic depth (`brief`, `normal`, or `deep`), and the compiled Tavily web research context.
  3. Receives a structured JSON payload defining:
     - `title`: Overall title of the lecture series.
     - `summary`: High-level summary.
     - `modules`: An array containing modules, where each module defines a title, description, and list of `scenes` (with scene titles, descriptions, and narration voiceover scripts).

#### Dynamic Scene Duration Recalculation
To prevent the video freezing on a static frame or cutting off voiceovers mid-sentence, the pipeline dynamically overrides the planner's estimated scene durations before code generation begins using `recalculateSceneDurations()`:
```typescript
const spokenDuration = Math.ceil(voiceover.length / 15) + 3;
scene.durationSeconds = Math.max(5, Math.min(45, spokenDuration));
```
- **Spoken Speed estimation**: Narration is estimated at ~15 characters per second.
- **Transition buffer**: A comfortable `3`-second viewing/transition buffer is added.
- **Clamping bounds**: The final duration is clamped between a minimum of `5` seconds (to allow visual absorption) and a maximum of `45` seconds (to prevent scenes from stalling).

### Stage 3: Manim Code Generation (`code_generation`)
- **Objective**: Generates Python scripts utilizing the Manim community framework for each scene.
- **Implementation**: [generateManimForModule()](file:///E:/programming/manimate-uni/src/lib/manimate/llm.ts#L152-L178)
- **Workflow**:
  1. Iterates over each module sequentially.
  2. Invokes the LLM using `MANIM_PROMPT`, sending the outline of that specific module and the overall lecture plan.
  3. Receives a JSON structure containing generated Python code for each scene.
  4. Maps the generated scene outputs back to the planned scene definitions using exact matching, prefix checks, or index order matching via `findPlannedScene()`.
  5. Writes each scene's code to disk under `generations/{jobId}/scene_code/module_{moduleIndex}_{sceneId}.py`.

### Stage 4: Rendering & Compiler Correction Loop (`rendering`)
- **Objective**: Compiles Python scripts into visual MP4 clips using the Manim compiler.
- **Implementation**: [renderSceneWithCorrections()](file:///E:/programming/manimate-uni/src/lib/manimate/manim.ts#L53-L97)
- **Workflow**:
  1. Resolves the Python environment path via [defaultManimPython()](file:///E:/programming/manimate-uni/src/lib/manimate/manim.ts#L41-L43) (defaults to `manim-env/Scripts/python.exe` in the project root, or `MANIM_PYTHON` environment variable).
  2. Invokes Manim using the command line:
     ```bash
     python -m manim -qh --media_dir <mediaDir> <pyFile> <className>
     ```
  3. If compilation succeeds:
     - Scans the directory using `newestMp4()` to grab the compiled MP4 file path and proceeds to the next scene.
  4. If compilation fails (throws stderr/tracebacks):
     - Catches the compiler error.
     - **Compiler Correction Loop**: If attempts remain (`max_correction_attempts`, default `3`), invokes [correctManimCode()](file:///E:/programming/manimate-uni/src/lib/manimate/llm.ts#L179-L193).
     - Sends the broken code, scene plan, and Python stack trace to the LLM to get corrected Python code.
     - Re-saves the script and repeats the compilation process.
     - If all retry attempts are exhausted, the job fails.

### Stage 5: Local Kokoro TTS Voiceover (`voiceover`)
- **Objective**: Synthesizes the narration scripts into audio voiceovers and muxes them with the corresponding video clips.
- **Implementation**: [generateTtsAudio()](file:///E:/programming/manimate-uni/src/lib/manimate/tts.ts#L21-L35)
- **Workflow**:
  1. If `skip_voiceovers` is enabled, this stage is bypassed.
  2. Dynamically imports `kokoro-js` using local ONNX runtimes.
  3. Initializes the model from pretrained community assets (`onnx-community/Kokoro-82M-v1.0-ONNX`) on `cpu` or `gpu` using precision `KOKORO_DTYPE` (default: `'q8'`).
  4. Synthesizes the scene voiceover script using the chosen voice (default: `'af_heart'`) and saves it to `generations/{jobId}/tts/module_{moduleIndex}_{sceneId}.wav`.
  5. Muxes the audio track into the scene video using [muxVoiceover()](file:///E:/programming/manimate-uni/src/lib/manimate/video.ts#L38-L78).

#### Audio/Video Time-Alignment Alignment
Because narration length and animation length rarely match perfectly, FFmpeg adjusts the clip timing:
- **Audio is longer than video**: The last frame of the video is frozen to keep visuals active using FFmpeg's video filter:
  ```bash
  -vf tpad=stop_mode=clone:stop_duration=${padDuration}
  ```
- **Video is longer than audio**: Silence is appended to the audio track to prevent empty audio signals:
  ```bash
  -af apad=pad_dur=${padDuration}
  ```
- **Perfect Match**: The video stream is copied and the audio is encoded directly.

### Stage 6: Stitching & Final Concatenation (`stitching`)
- **Objective**: Merges all scene video segments into a single cohesive lecture video.
- **Implementation**: [stitchFinal()](file:///E:/programming/manimate-uni/src/lib/manimate/video.ts#L80-L89)
- **Workflow**:
  1. Gathers the compiled individual scene video paths, grouped by their module index.
  2. For each module, writes a list file containing video paths and runs the FFmpeg concat demuxer:
     ```bash
     ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy module_{moduleIndex}_full.mp4
     ```
  3. Once module videos are completed, runs the concat demuxer again to join the modules into `generations/{jobId}/video.mp4`.
  4. Updates the global job store metadata status to `completed` and sets the final video endpoint link.
