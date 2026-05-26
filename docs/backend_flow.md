# Backend Architecture and Data Flow

This document details the backend flow of the Manimate Uni application, covering Next.js API routing, local concurrency queue management, active subprocess lifecycle control via AbortControllers, and the JSON-based file storage system.

---

## 1. Next.js API Route Architecture

The backend of Manimate Uni is built using Next.js Route Handlers. All API endpoints run inside a Node.js server environment and interact with the file system and local processes.

### Job Generation Endpoints

#### `GET` [/api/generate](file:///E:/programming/manimate-uni/src/app/api/generate/route.ts)
- **Purpose**: Lists all generated animation jobs stored in the local file system.
- **Workflow**:
  1. Invokes [listJobs()](file:///E:/programming/manimate-uni/src/lib/manimate/jobStore.ts#L43-L53) to scan the workspace-level `generations/` directory.
  2. Reads each job's `metadata.json`.
  3. Sorts all detected jobs by their creation timestamp (`created_at`) in descending order (newest first) and returns the list as JSON.

#### `POST` [/api/generate](file:///E:/programming/manimate-uni/src/app/api/generate/route.ts)
- **Purpose**: Creates and triggers a new animation generation job.
- **Workflow**:
  1. Validates that a non-empty `topic` string is present in the request body.
  2. Resolves optional fields (e.g., model provider, model overrides, topic depth, Max correction attempts) via a custom payload builder.
  3. Generates a unique UUID `jobId` using `crypto.randomUUID()`.
  4. Writes the initial job state file using [createInitialMetadata()](file:///E:/programming/manimate-uni/src/lib/manimate/jobStore.ts#L55-L76), setting the overall progress to `0%` and current stage to `web_research`.
  5. Spawns [runPipeline()](file:///E:/programming/manimate-uni/src/lib/manimate/pipeline.ts#L91-L318) asynchronously.
  6. Immediately responds to the client with an HTTP `202 Accepted` status along with the `jobId`. The actual pipeline processing runs in the background.

#### `GET` [/api/generate/[jobId]](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/route.ts)
- **Purpose**: Retrieves the detailed status and current progress metadata of a single job.
- **Workflow**:
  1. Locates the `metadata.json` file inside the job's folder (`generations/{jobId}/metadata.json`).
  2. Reads, parses, and returns the metadata JSON object. If the file is not found, responds with an HTTP `404 Not Found`.

#### `DELETE` [/api/generate/[jobId]](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/route.ts)
- **Purpose**: Cancels a running job or discards job files.
- **Query Parameter**: `discard` (boolean, e.g. `/api/generate/[jobId]?discard=true`)
- **Workflow**:
  1. Calls [cancelActiveJob()](file:///E:/programming/manimate-uni/src/lib/manimate/activeJobs.ts#L28-L37) to abort the active pipeline execution context and terminate all child processes (Manim, FFmpeg, etc.).
  2. **If `discard=true`**: Recursively removes the entire job directory (`generations/{jobId}`) from disk and returns HTTP `204 No Content`.
  3. **Otherwise**: Reads the job's `metadata.json`. If already terminal (`completed` or `failed`), does nothing. Otherwise, updates status to `failed`, sets the error message to `"Job cancelled by user"`, logs timestamps, saves the updated file, and returns HTTP `204 No Content`.

---

### Mastery Quiz Endpoints

Quiz generation is separate from the core video pipeline. It targets the student assessment workflow on a per-job basis.

#### `GET` [/api/generate/[jobId]/quiz](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Retrieves the mastery quiz for the corresponding lecture.
- **Workflow**:
  1. Checks if `generations/{jobId}/quiz.json` already exists. If yes, reads and returns it.
  2. If it does not exist, reads `lecture_plan.json` and the resolved model options.
  3. Invokes the LLM to generate the first 5 questions representing Difficulty Level 1 using [generateQuizQuestions()](file:///E:/programming/manimate-uni/src/lib/manimate/llm.ts#L195-L232).
  4. Appends tracking fields (`userResponse: null`, `isCorrect: null`) to each question.
  5. Saves the structure in `generations/{jobId}/quiz.json` and returns it.

#### `POST` [/api/generate/[jobId]/quiz](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Generates additional, harder questions for the quiz (progressive mastery).
- **Workflow**:
  1. Reads existing quiz questions from `quiz.json` and gets the current difficulty level.
  2. Increments the difficulty level (`difficultyLevel + 1`).
  3. Calls the LLM to generate 5 new questions matching the higher difficulty level.
  4. Appends the new questions to the existing quiz list and updates the difficulty level.
  5. Saves and returns the updated `quiz.json`.

#### `PATCH` [/api/generate/[jobId]/quiz](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/quiz/route.ts)
- **Purpose**: Syncs user responses and progress.
- **Workflow**:
  1. Receives an updated list of questions (including user answers and grading evaluations).
  2. Validates the payload structure.
  3. Writes the updated quiz state directly to `generations/{jobId}/quiz.json` to persist the student's score.

---

### Video Serving Endpoint

#### `GET` [/api/generate/[jobId]/video](file:///E:/programming/manimate-uni/src/app/api/generate/[jobId]/video/route.ts)
- **Purpose**: Streams the compiled lecture video file (`video.mp4`) supporting range-requests.
- **Workflow**:
  1. Verifies that `generations/{jobId}/video.mp4` exists.
  2. Checks for the `Range` request header.
  3. **If Range header exists** (supports scrubbing and seeking in HTML5 players):
     - Parses the range bounds (e.g., `bytes=0-`).
     - Spawns a Node.js `fs.createReadStream` bound to that byte offset.
     - Pipes the Node stream into a Web Streams API stream (`Readable.toWeb`).
     - Responds with HTTP `206 Partial Content` and matching headers (`Content-Range`, `Content-Length`, `Content-Type: video/mp4`).
  4. **Otherwise**:
     - Streams the entire video from the beginning with HTTP `200 OK` and a `Content-Disposition: inline` header.

---

## 2. In-Memory Concurrency Queue

To prevent heavy local resource exhaustion (since Manim and voiceover generation spawn subprocesses), jobs are throttled using a lightweight in-memory semaphore queue.

- **Source Code**: [src/lib/manimate/queue.ts](file:///E:/programming/manimate-uni/src/lib/manimate/queue.ts)
- **Key Functions**:
  - `acquireJobSlot()`: Check if active running count matches `MAX_CONCURRENT_JOBS` (dynamic env variable, fallback to `1`). If full, appends a Promise resolver function `() => void` into a global `waiters` FIFO array and waits. Once under threshold, increments running counter.
  - `releaseJobSlot()`: Decrements the running counter and shifts the next resolver out of the `waiters` queue, triggering it to resume the next queued job.
  - `queueStats()`: Returns diagnostic data reflecting the number of active jobs, queued jobs, and remaining worker slots.

---

## 3. Active Job and Subprocess Lifecycle Management

Because the pipeline relies on long-running CLI tools (Python interpreter rendering Manim, ffmpeg concatenating/muxing), the backend tracks child subprocesses and provides instant cancellation mechanisms.

- **Source Code**: [src/lib/manimate/activeJobs.ts](file:///E:/programming/manimate-uni/src/lib/manimate/activeJobs.ts)
- **State Store**: A global Map `globalThis.__manimateActiveJobs` tracks active jobs by UUID. Each job maps to:
  ```typescript
  type ActiveJob = {
    controller: AbortController;
    children: Set<ChildProcessWithoutNullStreams>;
  };
  ```
- **Job Start & Register**:
  1. `startActiveJob(jobId)` registers a new `AbortController` and an empty `children` child-process Set.
  2. The command wrapper [runCommand()](file:///E:/programming/manimate-uni/src/lib/manimate/process.ts#L5-L35) spawns processes. Before spawning, it checks if the job's controller is aborted.
  3. Once spawned, the `ChildProcess` object is registered into the active job's `children` Set. On command completion or error, the child is removed from the Set.
- **Cancellation Flow**:
  - When `DELETE /api/generate/[jobId]` is received, it invokes `cancelActiveJob(jobId)`.
  - The controller's `.abort()` signal is triggered.
  - The code loops over the registered `children` and kills each active process using `SIGTERM` signals.
  - Finally, the job is removed from the active map.

---

## 4. File-Based Database and Job Store

Manimate Uni runs without a traditional SQL/NoSQL database. State, logs, and files are stored strictly on-disk.

- **Directory Layout**:
  ```
  generations/
    ├── {jobId}/
    │    ├── metadata.json           # Stores job configurations, progress, errors, timestamps
    │    ├── lecture_plan.json       # Generated plan outlining modules and scene descriptions
    │    ├── quiz.json               # Persisted user quiz answers and questions list
    │    ├── video.mp4               # Final compiled/stitched video file
    │    ├── scene_code/             # Python files generated for individual scenes
    │    ├── media/                  # Intermediate Manim assets (images/video segments)
    │    ├── tts/                    # Intermediate generated WAV voiceovers
    │    └── voiceover_videos/       # Individual scene video segments muxed with voiceover audio
  ```

### Progress Weight Calculations

Overall job progress is updated continuously using [updateStage()](file:///E:/programming/manimate-uni/src/lib/manimate/jobStore.ts#L78-L101) by scaling the percentage of completion against hardcoded stage weights:

| Stage Name | Description | Weight |
| :--- | :--- | :---: |
| `web_research` | Gathers factual data via Tavily | **5%** |
| `lecture_planning` | Formulates lesson outline and script | **15%** |
| `code_generation` | Generates python scripts for scenes | **20%** |
| `rendering` | Runs Manim compiler over python scripts | **35%** |
| `voiceover` | Generates speech WAVs via Kokoro ONNX | **15%** |
| `stitching` | Stitches and muxes the files together | **10%** |

Overall progress is evaluated in [computeOverallProgress()](file:///E:/programming/manimate-uni/src/lib/manimate/jobStore.ts#L103-L112) as:
$$\text{Progress} = \sum (\text{Stage Weight} \times \frac{\text{Stage Completion \%}}{100})$$
This ensures accurate progress bar reporting on the frontend.
