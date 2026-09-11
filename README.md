# Manimate Uni

Manimate Uni is an agentic Next.js application that translates educational topics into high-fidelity, narrated Manim videos. The entire pipeline—web research, lecture planning, Python code generation, rendering, local text-to-speech, and video stitching—is orchestrated directly within Next.js.

---

## 🚀 Key Features

* **Multi-LLM Provider Engine (Vercel AI SDK)**: Supports OpenAI, Anthropic, Google Gemini, Mistral AI, Groq, OpenRouter (one key, 400+ models), and NVIDIA NIM (hosted or self-hosted). Includes dynamic model presets, custom `provider/model` overrides, and round-robin key rotation per provider.
* **Local Subprocess Pipeline**: Executes the Python compiler to run Manim CLI renders and FFMPEG to mux voiceovers and stitch scenes.
* **Self-Correcting Rendering Loop**: If the LLM generates Manim code that fails to compile, the pipeline captures the traceback, invokes the corrector LLM, and repairs the script on the fly (up to 3 retries).
* **Dynamic Scene Pacing**: Calculates scene durations from voiceover length ($\text{duration} = \lceil\text{chars} / 15\rceil + 3$ seconds) to avoid silent pauses or frozen video tracks.
* **Mastery Assessment Quizzes**: Generates 5-question multiple-choice quizzes from the lecture content, with instant feedback and progressively harder rounds.
* **Local Voiceover Synthesis**: High-fidelity speech synthesis using the Kokoro-82M ONNX model, run locally.

---

## ⚙️ Architecture

### 1. Supabase for state and artifacts

* **Postgres** holds every job. One row per generation in `public.jobs`, with the lecture plan and quiz as `jsonb` columns. Schema lives in `supabase/migrations/0001_init.sql`.
* **Storage** (private `generations` bucket) holds the finished `video.mp4` and the generated `.py` scene code, under `{user_id}/{job_id}/`.
* **Auth + Row Level Security** scope every job to its owner. Each user only ever sees their own generations — RLS enforces this at the database, so route handlers don't compare user ids by hand.
* Intermediates (`media/`, `tts/`, `voiceover_videos/`, per-module MP4s) are **scratch**. They live on the container's local disk under `MANIMATE_WORK_DIR` and are deleted when the job ends. Only the final video is uploaded.

Videos are served by redirecting to a short-lived signed Storage URL, so playback traffic bypasses the app server while still requiring an authenticated, authorized request to obtain the link.

### 2. Multi-key rotation

For throughput without rate-limiting, provide comma-separated keys (e.g. `OPENAI_API_KEYS="key1,key2,key3"`). The server splits them and rotates round-robin per request.

### 3. Single-process render queue

Renders run in-process as detached promises, gated by an in-memory semaphore (`MAX_CONCURRENT_JOBS`, default 1). This means the app **must run as a single, always-on instance** — see Deployment below. Jobs orphaned by a restart are failed automatically at boot (`src/lib/manimate/reaper.ts`).

### 4. How work is scheduled inside a job

`import manim` costs ~3.4s and used to be paid once per scene, per correction attempt. Every scene in a module is therefore rendered by a **single Manim process** (their class names are rewritten to stay unique), and modules render **in parallel** up to `MANIM_RENDER_CONCURRENCY`. If the batch fails — a syntax error takes the whole file down, and two scenes can collide on a helper name — the scenes it did not produce fall back to individual renders with the usual correction loop.

Voiceover synthesis no longer waits for rendering. Its input is the lecture plan's text, so Kokoro starts as soon as the plan exists and runs alongside code generation and rendering; only the ffmpeg mux needs both halves. Manim's LaTeX and text caches are shared across the whole job rather than thrown away per attempt.

Progress is merged inside Postgres by `update_job_stage()` (migration `0002`), which makes each tick one round trip instead of two and keeps concurrent stage updates from clobbering each other.

---

## 🛠️ Local Setup

### 1. System dependencies

* **Node.js** 18+ (Active LTS).
* **FFMPEG & FFProbe** on your `PATH`, or set `FFMPEG_PATH` / `FFPROBE_PATH`.
* **LaTeX** — required for `MathTex`, which the prompts actively use. MiKTeX (Windows) or TeX Live (macOS/Linux). Without it, math scenes fail and burn all correction retries.
* **cairo & pango** — hard requirements of Manim (`pycairo`, `manimpango`). Bundled on Windows/macOS wheels; on Linux install `libcairo2-dev` and `libpango1.0-dev`.

### 2. Python environment

```bash
python -m venv manim-env

# Windows (PowerShell):
.\manim-env\Scripts\Activate.ps1
# macOS/Linux:
source manim-env/bin/activate

pip install manim
manim --version
```

### 3. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema — either `supabase db push`, or paste each file in `supabase/migrations/` into the SQL Editor in order. `0001_init.sql` creates the `jobs` table, its RLS policies, the private `generations` bucket, and the bucket's access policies; `0002_stage_progress_rpc.sql` adds the progress-merge function. The app falls back to a slower client-side merge if `0002` is missing, and logs a warning saying so.
3. For a quick start, turn **off** email confirmation under *Authentication → Providers → Email*, so sign-up gives you a session immediately.
4. Copy the Project URL, `anon` key, and `service_role` key from *Project Settings → API*.

### 4. Application

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

* **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
* **At least one LLM provider**: `MISTRAL_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `NVIDIA_API_KEY`.
* **Python**: `MANIM_PYTHON` — the absolute path to your venv interpreter (`manim-env/Scripts/python.exe` on Windows, `manim-env/bin/python` elsewhere).
* **Scratch dir**: `MANIMATE_WORK_DIR` — defaults to a `manimate` folder in your system temp dir.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, and generate.

> `NEXT_PUBLIC_*` variables are inlined into the client bundle **at build time**. If you change them, rebuild.

---

## 🚢 Deployment

The app **cannot run on Vercel, Netlify, or Supabase Edge Functions.** Renders take minutes, spawn Python subprocesses, and need a writable disk — none of which serverless provides. Deploy the included `Dockerfile` to a container host: Railway, Render, Fly.io, or your own VPS.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..." \
  -t manimate .
```

The image bundles Node, Python + Manim, ffmpeg, a TeX Live subset, and the pre-downloaded Kokoro weights. Expect **3–4 GB**; check your host allows that.

### Host requirements

| Requirement | Why |
| :--- | :--- |
| **Scale-to-zero / sleep disabled** | `POST /api/generate` returns `202` and keeps rendering in the background. If the platform suspends the instance after the response, every job dies mid-render. |
| **≥ 2 vCPU, ≥ 4 GB RAM** | Manim at 720p30 will OOM a 512 MB instance. Scenes render in parallel, so extra cores are used — `MANIM_RENDER_CONCURRENCY` defaults to cores-1 (max 4), and each concurrent render holds a few hundred MB. |
| **Single instance** | The render queue and cancellation registry are in-process. Multiple replicas would exceed `MAX_CONCURRENT_JOBS` and break job cancellation. |
| Ephemeral disk is fine | Local disk is scratch only; durable state is in Supabase. |

### Environment

Set everything from `.env.example` on the host, plus `MANIM_PYTHON=/opt/manim-env/bin/python` (already baked into the image). `NEXT_PUBLIC_*` values must **also** be present at build time — Railway and Render expose service variables to the build automatically; on Fly pass them as `--build-arg`.

### Video size and Supabase limits

`MANIM_QUALITY` defaults to `-qm` (720p30). Raising it to `-qh` (1080p60) renders roughly 4x slower and produces files past Supabase Storage's default 50 MB per-object limit. Raise the project's file size limit before switching. Uploads over 6 MB use the resumable (TUS) endpoint, so a network blip won't discard a finished render.

---

## 📝 Quiz Assessment

After a video completes, choose **Take Mastery Quiz** on the Studio screen to open `/studio/{jobId}/quiz`. Answers are graded instantly with an explanation of the correct, selected, and skipped options. **Generate Harder Questions** increments the difficulty level and appends 5 more proof- or calculation-oriented questions.

---

## ⚠️ Security note

The pipeline executes LLM-generated Python. The container is the sandbox: child processes are spawned with a minimal environment so generated code never sees your API keys, and the image runs as an unprivileged user. Web-search snippets do flow into the code generator, which is a prompt-injection path to code execution. That is an acceptable trade for an authenticated deployment you control; before opening public sign-ups, add real isolation (a throwaway per-render container, gVisor, or a render user with no network egress).
