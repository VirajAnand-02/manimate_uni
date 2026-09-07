# Backend Architecture and Data Flow

This document details the backend flow of the Manimate Uni application, covering Next.js API routing, authentication, local concurrency queue management, active subprocess lifecycle control via AbortControllers, and the Supabase persistence layer.

---

## 1. Next.js API Route Architecture

The backend of Manimate Uni is built using Next.js Route Handlers. All API endpoints run inside a Node.js server environment and interact with Supabase, the scratch file system, and local processes.

**Every endpoint requires an authenticated session.** Handlers resolve the caller via `createClient()` (`src/lib/supabase/server.ts`) and answer `401` when there is none. Reads and writes go through that request-scoped client, so Row Level Security on `public.jobs` — not hand-written checks — is what stops one user reaching another's job. `jobId` is validated as a UUID (`isValidJobId`) before use.

### Job Generation Endpoints

#### `GET` [/api/generate](file://./src/app/api/generate/route.ts)
- **Purpose**: Lists all generated animation jobs stored in the local file system.
- **Workflow**:
  1. Invokes `listJobs()` with the request-scoped client.
  2. RLS limits the result to the caller's own rows; Postgres sorts by `created_at` descending.
  3. Returns the list as JSON.

#### `POST` [/api/generate](file://./src/app/api/generate/route.ts)
- **Purpose**: Creates and triggers a new animation generation job.
- **Workflow**:
  1. Resolves the caller; answers `401` if there is no session.
  2. Validates that a non-empty `topic` string is present in the request body.
  3. Resolves optional fields (model provider, model override, topic depth, max correction attempts) via a payload builder. `render_dir`, `manim_python` and `tts_output_dir` are **not** accepted — the first two were never read, and the third was a caller-controlled write path.
  4. Generates a UUID `jobId` using `crypto.randomUUID()`.
  5. Inserts the initial row via `createInitialMetadata()` with the caller's `user_id`, progress `0%`, stage `web_research`.
  6. Spawns `runPipeline(jobId, userId, payload)` asynchronously.
  7. Responds `202 Accepted` with the `jobId`. The pipeline runs in the background.

#### `GET` [/api/generate/[jobId]](file://./src/app/api/generate/[jobId]/route.ts)
- **Purpose**: Retrieves the detailed status and current progress metadata of a single job.
- **Workflow**:
  1. Validates `jobId` is a UUID and resolves the caller.
  2. Selects the row through the request-scoped client. RLS makes another user's job indistinguishable from a missing one, so both give `404 Not Found`.
  3. Returns the row mapped back into the metadata shape the frontend expects.

#### `DELETE` [/api/generate/[jobId]](file://./src/app/api/generate/[jobId]/route.ts)
- **Purpose**: Cancels a running job or discards job files.
- **Query Parameter**: `discard` (boolean, e.g. `/api/generate/[jobId]?discard=true`)
- **Workflow**:
  1. Validates `jobId`, resolves the caller, and confirms the row is visible under RLS (else `404`).
  2. Calls `cancelActiveJob()` to abort the pipeline's AbortController and `SIGTERM` its child processes (Manim, FFmpeg).
  3. **If `discard=true`**: removes the job's objects from Storage, deletes the scratch directory, deletes the row, and returns `204 No Content`.
  4. **Otherwise**: if already terminal (`completed` / `failed`), no-ops. Else sets status `failed` with error `"Job cancelled by user"` and returns `204 No Content`.

---

### Mastery Quiz Endpoints

Quiz generation is separate from the core video pipeline. It targets the student assessment workflow on a per-job basis.

#### `GET` [/api/generate/[jobId]/quiz](file://./src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Retrieves the mastery quiz for the corresponding lecture.
- **Workflow**:
  1. Checks the row's `quiz` column. If populated, returns it.
  2. Otherwise reads the `lecture_plan` column (`409` if the video hasn't been generated yet) and the stored model options.
  3. Invokes the LLM to generate the first 5 questions representing Difficulty Level 1 using [generateQuizQuestions()](file://./src/lib/manimate/llm.ts#L195-L232).
  4. Appends tracking fields (`userResponse: null`, `isCorrect: null`) to each question.
  5. Writes the structure to the `quiz` column and returns it.

#### `POST` [/api/generate/[jobId]/quiz](file://./src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Generates additional, harder questions for the quiz (progressive mastery).
- **Workflow**:
  1. Reads existing quiz questions from the `quiz` column and gets the current difficulty level.
  2. Increments the difficulty level (`difficultyLevel + 1`).
  3. Calls the LLM to generate 5 new questions matching the higher difficulty level.
  4. Appends the new questions to the existing quiz list and updates the difficulty level.
  5. Saves and returns the updated quiz.

#### `PATCH` [/api/generate/[jobId]/quiz](file://./src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Syncs user responses and progress.
- **Workflow**:
  1. Receives an updated list of questions (including user answers and grading evaluations).
  2. Validates the payload structure.
  3. Writes the updated quiz state to the `quiz` column to persist the student's score.

---

### Video Serving Endpoint

#### `GET` [/api/generate/[jobId]/video](file://./src/app/api/generate/[jobId]/video/route.ts)
- **Purpose**: Hands the client a playable URL for the finished video.
- **Query Parameter**: `download` (`?download=1` asks Storage to set `Content-Disposition: attachment` — the browser ignores `<a download>` across origins).
- **Workflow**:
  1. Validates `jobId` is a UUID and the caller is signed in.
  2. Reads `final_video_path` through the **request-scoped** client. Another user's job returns no row, so this 404s rather than leaking.
  3. Mints a signed Storage URL (1 hour TTL) with the service-role client.
  4. Responds `302` to that URL with `Cache-Control: no-store`.

Range requests are handled by Supabase's CDN: browsers reissue them against the redirect target, so seeking works and playback traffic never touches this container.

---

## 2. In-Memory Concurrency Queue

To prevent heavy local resource exhaustion (since Manim and voiceover generation spawn subprocesses), jobs are throttled using a lightweight in-memory semaphore queue.

- **Source Code**: [src/lib/manimate/queue.ts](file://./src/lib/manimate/queue.ts)
- **Key Functions**:
  - `acquireJobSlot()`: Check if active running count matches `MAX_CONCURRENT_JOBS` (dynamic env variable, fallback to `1`). If full, appends a Promise resolver function `() => void` into a global `waiters` FIFO array and waits. Once under threshold, increments running counter.
  - `releaseJobSlot()`: Decrements the running counter and shifts the next resolver out of the `waiters` queue, triggering it to resume the next queued job.
  - `queueStats()`: Returns diagnostic data reflecting the number of active jobs, queued jobs, and remaining worker slots.

---

## 3. Active Job and Subprocess Lifecycle Management

Because the pipeline relies on long-running CLI tools (Python interpreter rendering Manim, ffmpeg concatenating/muxing), the backend tracks child subprocesses and provides instant cancellation mechanisms.

- **Source Code**: [src/lib/manimate/activeJobs.ts](file://./src/lib/manimate/activeJobs.ts)
- **State Store**: A global Map `globalThis.__manimateActiveJobs` tracks active jobs by UUID. Each job maps to:
  ```typescript
  type ActiveJob = {
    controller: AbortController;
    children: Set<ChildProcessWithoutNullStreams>;
  };
  ```
- **Job Start & Register**:
  1. `startActiveJob(jobId)` registers a new `AbortController` and an empty `children` child-process Set.
  2. The command wrapper [runCommand()](file://./src/lib/manimate/process.ts#L5-L35) spawns processes. Before spawning, it checks if the job's controller is aborted.
  3. Once spawned, the `ChildProcess` object is registered into the active job's `children` Set. On command completion or error, the child is removed from the Set.
- **Cancellation Flow**:
  - When `DELETE /api/generate/[jobId]` is received, it invokes `cancelActiveJob(jobId)`.
  - The controller's `.abort()` signal is triggered.
  - The code loops over the registered `children` and kills each active process using `SIGTERM` signals.
  - Finally, the job is removed from the active map.

---

## 4. Supabase Persistence

Job state lives in Postgres; finished artifacts live in Supabase Storage. Nothing durable is kept on the container's disk.

### Postgres — `public.jobs`

One row per generation, defined in `supabase/migrations/0001_init.sql`. The row mirrors the old `metadata.json` shape (so the frontend was unchanged), with two additions:

- `user_id` — owner, enforced by the `own jobs` RLS policy.
- `lecture_plan` / `quiz` — `jsonb` columns replacing the former sidecar files.
- `final_video_path` — a Storage **object key**, not a URL. Signed URLs expire, so they are minted per request instead of persisted.

`src/lib/manimate/jobStore.ts` is the only module that touches the table. Every function takes an optional Supabase client: route handlers pass their request-scoped one (RLS applies), while the pipeline — a detached promise with no request context, and therefore no session cookie — falls back to the service role.

`updateStage()` fires on every progress tick and deliberately updates only `stages`, `overall_progress`, `current_stage` and `elapsed_seconds`, so a tick never rewrites `lecture_plan`.

### Storage — private `generations` bucket

```
{user_id}/{job_id}/
   ├── video.mp4          # final artifact
   └── scene_code/*.py    # generated Manim scripts (debugging aid)
```

Bucket policies key on the first path segment matching `auth.uid()`. Files over 6 MB upload via the resumable (TUS) endpoint so a network blip cannot discard a finished render.

### Scratch disk — `MANIMATE_WORK_DIR`

Manim needs real files, so a render still writes to disk, under `jobWorkDir(jobId)` (`src/lib/manimate/workspace.ts`):

```
{MANIMATE_WORK_DIR}/{job_id}/
   ├── scene_code/          # generated Python
   ├── media/scene_*/attempt_N/   # Manim output, one dir per correction attempt
   ├── tts/                 # Kokoro WAVs
   ├── voiceover_videos/    # per-scene muxed clips
   └── module_*_full.mp4    # per-module concatenations
```

All of it is disposable and removed in the pipeline's `finally` block. `scene_id` comes from LLM JSON and is sanitised (`sanitizeSegment`) before reaching any path.

### Restart recovery

Renders are in-process, so a crash or redeploy orphans them. `src/instrumentation.ts` runs `reapOrphanedJobs()` once at boot, failing any row left `pending`/`running` — otherwise the Studio page would poll a dead job every 2s forever.

### Progress Weight Calculations

Overall job progress is updated continuously using [updateStage()](file://./src/lib/manimate/jobStore.ts#L78-L101) by scaling the percentage of completion against hardcoded stage weights:

| Stage Name | Description | Weight |
| :--- | :--- | :---: |
| `web_research` | Gathers factual data via Tavily | **5%** |
| `lecture_planning` | Formulates lesson outline and script | **15%** |
| `code_generation` | Generates python scripts for scenes | **20%** |
| `rendering` | Runs Manim compiler over python scripts | **35%** |
| `voiceover` | Generates speech WAVs via Kokoro ONNX | **15%** |
| `stitching` | Stitches and muxes the files together | **10%** |

Overall progress is evaluated in [computeOverallProgress()](file://./src/lib/manimate/jobStore.ts#L103-L112) as:
$$\text{Progress} = \sum (\text{Stage Weight} \times \frac{\text{Stage Completion \%}}{100})$$
This ensures accurate progress bar reporting on the frontend.
