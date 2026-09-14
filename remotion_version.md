# Manimate (Remotion edition) — build prompt

Build an agentic Next.js application that turns a topic into a narrated, animated
explanatory video. The pipeline — web research, lecture planning, scene
generation, rendering, text-to-speech, and assembly — runs inside the Next.js
server process. Rendering uses **Remotion** (React → headless Chromium → ffmpeg)
rather than Manim.

This document is the specification. Where a requirement is given with a rationale,
the rationale comes from measurements on the Manim-based predecessor; treat those
requirements as load-bearing rather than stylistic.

---

## 0. Licensing — decide this before writing code

Remotion is **free for individuals and companies of up to three people**; four or
more requires a paid Company License. Its repository carries a custom licence
(`NOASSERTION`), not an OSI one.

If that is unacceptable, substitute **Revideo** (MIT — a fork of Motion Canvas
with a server-side rendering API) or **Motion Canvas** (MIT). The architecture
below is renderer-agnostic: nothing outside `src/lib/render/` should need to
change for that swap. Keep it that way deliberately.

---

## 1. Non-negotiable constraints

- **Not serverless.** Renders take minutes, spawn a browser, and need writable
  disk. Deploy as a single long-lived container (Railway, Render, Fly, VPS).
- **Single instance.** The render queue and cancellation registry live in process
  memory. Do not scale to multiple replicas without first moving the queue out.
- **Scale-to-zero must be off.** `POST /api/generate` returns `202` and keeps
  working in the background; suspending the instance after the response kills
  every in-flight render.
- **Durable state lives in Postgres and object storage.** Local disk is scratch,
  deleted when the job ends.
- **The pipeline renders model-authored content.** That is a security boundary —
  see §11.

---

## 2. Stack

| Concern | Choice |
| :--- | :--- |
| App | Next.js (App Router), TypeScript, Tailwind v4 |
| Rendering | `@remotion/bundler`, `@remotion/renderer`, `@remotion/player` |
| Math typesetting | KaTeX — **not** a LaTeX installation (§5.4) |
| LLM | Vercel AI SDK, multi-provider (§6) |
| TTS | Kokoro (`kokoro-js`, ONNX, local) or a hosted TTS behind one interface |
| State | Supabase Postgres + Storage + Auth, with RLS |
| Media | ffmpeg (Remotion ships its own; expose the path for post-processing) |

Pin every `@ai-sdk/*` provider package to the **same `@ai-sdk/provider` major
version** as the installed `ai` package. Mixing majors fails at runtime, not at
install time, and the error does not name the cause.

---

## 3. Pipeline stages

```
research → plan → scene generation → validate → render → narrate → publish
```

Progress weights: research 5, planning 15, scene generation 20, rendering 35,
narration 15, publishing 10.

Narration does **not** belong at the end of the critical path. Its input is the
plan's voiceover text, which exists before any rendering begins. Synthesise audio
concurrently with scene generation and rendering (§7).

---

## 4. Data model

One row per job in `public.jobs`:

```
id                uuid primary key
user_id           uuid not null references auth.users on delete cascade
topic             text not null
status            text check (status in ('pending','queued','running','completed','failed'))
overall_progress  int
current_stage     text
created_at, updated_at, started_at, finished_at  timestamptz
elapsed_seconds   double precision
error             text
final_video_path  text        -- storage object key, never a URL
options           jsonb
stages            jsonb
lecture_plan      jsonb
quiz              jsonb
```

Requirements:

- **RLS on, scoped to `auth.uid() = user_id`.** Route handlers must never compare
  user ids by hand — let the database refuse.
- Store an **object key**, not a URL. Signed URLs expire; mint them per request.
- Private storage bucket, keys under `{user_id}/{job_id}/`.
- Index `(user_id, created_at desc)`, plus a partial index on active statuses for
  the reaper.

### 4.1 Progress updates must be atomic

Write a Postgres function `update_job_stage(job_id uuid, stage text, patch jsonb)`
that merges the patch into `stages`, recomputes `overall_progress` from the stage
weights, and bumps `updated_at` — in one statement, with `SELECT … FOR UPDATE`.

Do **not** implement this as read-modify-write in application code. It doubles the
round trips on a path that fires dozens of times per job, and once scenes render
concurrently, two stages finishing together will silently clobber each other's
progress.

Bound anything that accumulates inside `stages` (log arrays, failure lists). The
whole blob is rewritten on every tick, so an unbounded array is quadratic in bytes
written.

---

## 5. The renderer

This is where the design diverges most from a straight port. Read all of §5 before
writing any of it.

### 5.1 Render the whole lecture as ONE composition

Do not render scene-by-scene and concatenate. Compose the lecture as a single
Remotion composition using `<Series>` / `<Sequence>` and render it once.

This deletes an entire class of bug. The predecessor concatenated per-scene MP4s
with ffmpeg's concat demuxer under stream copy, which requires every input to
agree on stream layout — so a lecture mixing narrated and silent scenes produced a
file that dropped audio partway through. With one composition there is no concat
step, no stream mismatch, and no silent-track padding workaround.

### 5.2 Timing is derived from the audio, not guessed

The predecessor estimated scene duration as `ceil(chars / 15) + 3` seconds, then
re-encoded the video to pad it when the real narration did not match.

Instead: synthesise narration first, measure each clip, and feed real durations to
the composition through `calculateMetadata`:

```tsx
<Composition
  id="Lecture"
  component={Lecture}
  schema={lectureSchema}
  calculateMetadata={async ({ props }) => {
    const fps = 30;
    const durations = await Promise.all(
      props.scenes.map((s) => audioDurationSeconds(s.audioSrc)),
    );
    return {
      fps,
      durationInFrames: Math.ceil(durations.reduce((a, b) => a + b, 0) * fps),
    };
  }}
/>
```

Each scene's `<Sequence durationInFrames>` is its own measured audio length plus a
small tail. Narration and animation are then frame-accurate by construction, and
nothing is ever re-encoded to fix a mismatch.

### 5.3 Prefer generated *data* over generated *code*

This is the single biggest reliability lever, and the main reason to move off
Manim at all.

Build a **vetted component library** — hand-written, tested, never model-authored:

```
TitleCard        BulletList        EquationBlock      EquationTransform
FunctionPlot     NumberLine        GeometryFigure     LabelledDiagram
CodeBlock        ComparisonTable   ProgressiveReveal  Callout
```

Define a **Zod schema** covering every component and its props, and attach it to
the composition via the `schema` prop. The model then emits *props validated
against that schema* rather than arbitrary React.

Why this matters: a schema violation is caught in milliseconds with a precise path
(`scenes[2].content.equations[0].latex: required`), which is an excellent
correction prompt. Arbitrary generated code fails at render time, minutes in, with
a stack trace. Most of the correction loop's work simply disappears.

**Escape hatch:** allow a `custom` scene kind carrying free-form TSX for what the
library cannot express. Gate it behind §5.5's ladder and cap how many scenes per
lecture may use it. Track the ratio — if it stays high, the component library is
missing something. Add a component rather than loosening the gate.

### 5.4 Math without a LaTeX toolchain

Use **KaTeX**. The predecessor's image carried a 1.17 GB TeX Live layer, and LaTeX
failures were a leading cause of burned correction retries.

KaTeX renders inside the browser Remotion already runs, covers the subset of LaTeX
explanatory math actually needs, and fails with a parse error you can hand to the
model instead of a 200-line `dvisvgm` log. Parse every `latex` string with KaTeX in
strict mode **at validation time**, before rendering.

### 5.5 Validation ladder — fail cheap, fail early

Run these gates in order. Each is orders of magnitude cheaper than the next.

1. **Zod parse** of scene props — ~1 ms.
2. **KaTeX strict parse** of every math string — ~1 ms.
3. **esbuild transform** of any `custom` TSX — catches syntax errors without
   executing anything, ~10 ms.
4. **`selectComposition()`** — resolves metadata, surfaces prop errors, ~1 s.
5. **`renderStill()` at the scene's midpoint frame** — one frame, ~1 s. Catches
   blank output, overflow and crashes for almost nothing.
6. **`renderMedia()`** — the expensive one, only once 1–5 pass.

Feed the failing gate's message into the correction prompt. A Zod path or a KaTeX
parse error is a far better repair signal than a rendering stack trace.

### 5.6 Optional: actually look at the frame

Gate 5 already produces a real PNG cheaply. Send it to a vision-capable model with
a narrow question: *is any text clipped by the frame edge, is anything
overlapping, is the frame essentially blank?*

Layout defects are precisely what a text-only pipeline cannot detect, and they are
the most common "rendered fine but looks wrong" failure. Make it opt-in via env;
it costs one extra call per scene.

### 5.7 Bundle once, reuse the browser

`bundle()` is expensive and its output is identical for every job until the code
changes. Build it **once per process**, key a cache on a hash of the Remotion entry
source, and reuse the resulting `serveUrl` for every render. Likewise call
`openBrowser()` once and pass the instance into renders.

The predecessor paid a ~3.4s process start on *every scene and every retry* — with
a dozen scenes plus retries, that was most of the wall clock. Do not recreate that
cost in a new shape.

### 5.8 Concurrency and caching

- `renderMedia({ concurrency })` — default `cpus - 1`, capped, env-overridable.
  Chromium rendering is CPU-bound and parallelises well.
- **Content-hash every scene's props.** On a correction retry only the edited
  scene changed; cache rendered scene output by hash so the rest is not redone.
- Route all randomness through Remotion's seeded `random(seed)` so renders are
  reproducible and the cache is sound.

---

## 6. The LLM layer

### 6.1 Provider abstraction

Support Mistral, OpenAI, Anthropic, Google, Groq, OpenRouter and NVIDIA NIM behind
one `resolveProviderAndModel(provider?, model?)` plus `getModel(provider, model)`.

OpenRouter and NIM speak the OpenAI wire format — reuse the OpenAI provider with a
custom `baseURL` instead of adding dependencies. **Use the chat-completions entry
point explicitly**; the default targets OpenAI's `/responses` endpoint, which
neither gateway implements. Make NIM's base URL configurable — self-hosting is that
product's entire point.

**The `provider/model` override syntax must apply only when no provider was
named.** Groq, OpenRouter and NIM all use ids containing slashes
(`openai/gpt-oss-120b`, `anthropic/claude-sonnet-5`, `nvidia/nemotron-…`).
Splitting those silently routes the request to the wrong provider with the wrong
key, and the resulting error complains about a missing key rather than the real
cause.

### 6.2 Key rotation

Accept comma-separated `*_API_KEYS` and rotate round-robin. **Retire a key for the
process lifetime when it returns 401/403**, and retry immediately with a different
key rather than backing off — there is nothing to back off from. One revoked key in
a rotation list otherwise costs a failed request plus a sleep on every Nth call.

### 6.3 Model-authored JSON is not clean JSON

Write one `extractJson(text)`, used everywhere, which:

- strips `<think>…</think>` blocks — reasoning models emit them, with braces inside;
- prefers a fenced block wherever it appears, not only at the string ends;
- returns the **first balanced value**, tracking string literals and escapes.

Do not slice from the first `{` to the last `}`. That swallows anything
brace-bearing after the JSON and yields
`Unexpected non-whitespace character after JSON`, which reads like a truncation bug
and is not one.

### 6.4 Planning is output-token bound — split it

Measured on the predecessor: generation throughput is flat (~120 tok/s), so
planning latency is simply tokens ÷ throughput. One call emitting a whole lecture
took **91s for a "deep" plan — 11,809 output tokens**.

Therefore:

1. **Outline call** — title, summary, module titles, descriptions, scene counts.
   Small and fast.
2. **Per-module scene calls, issued concurrently** — each receives the outline and
   every module title so modules do not overlap.

Wall time becomes outline + slowest module instead of the sum. Drop a module whose
scene call fails rather than failing the lecture; require at least one to survive.

Expect sub-linear gains: providers throttle concurrent requests per account
(measured 1.67x for 4 concurrent calls, not 4x). Make the width an env knob and do
not over-promise.

### 6.5 Emit only what something consumes

Every field in the plan schema costs output tokens on the critical path. Before
adding one, name its consumer. The predecessor's schema carried seven fields
(`objectives`, `keyConcepts`, `animationIdeas`, per-scene `moduleTitle`, `camera`,
`transitionToNext`, `notesForRenderer`) that reached neither the renderer nor the
code generator — 20–27% of output tokens spent on nothing.

### 6.6 Reasoning budget

Expose `LLM_REASONING_EFFORT` (`low` | `medium` | `high`) and pass it through as
provider options. On reasoning models the default spends most of the output budget
on hidden thinking — measured **920 of 1262 tokens** on one model for a lecture
outline, dropping to **59 at `low` with identical structural output**. On an
output-bound stage this is the largest single lever available.

### 6.7 Correction loop

Bounded retries (default 3) per scene. Give the model the scene's intent, the
current props or code, and the **specific** failure from the validation ladder.

Cap the error text — send head and tail, elide the middle. It is input tokens on
every retry, and providers rate-limit on tokens per minute.

---

## 7. Narration

- Kokoro ONNX locally, or a hosted TTS, behind a single `synthesize(text, voice)`.
- **Pre-warm the model at job start**, not on first use. Lazy-loading puts a
  multi-second stall exactly where rendering finishes.
- Start synthesis **as soon as the plan exists**, concurrently with scene
  generation and rendering. Only the composition needs both halves.
- Measure each clip's real duration and feed it to `calculateMetadata` (§5.2).
- Sanitise narration in the **schema**, not in post-processing: spoken words only,
  no bracketed stage directions, markdown emphasis or parentheticals.
- **Emit WebVTT captions** from the narration text and per-scene timings. You
  already hold both; it is nearly free, and it makes the output accessible and
  searchable. Offer burnt-in subtitles as a render option.

---

## 8. Job lifecycle

- In-process semaphore, `MAX_CONCURRENT_JOBS` (default 1).
- `AbortController` per job; kill child processes and browser tabs on cancel.
- **Heartbeat every 30s** while a job is alive, touching `updated_at`.
- **Reap jobs silent for ~3 minutes**, on a sweep (every 60s) — not only at boot.

Do not reap by status alone. "Any active row is orphaned" holds only while a single
instance owns the database. The moment a developer's local server and the deployed
container share one project, each boot kills the other's in-flight render — and in
development, merely editing a config file restarts the server and destroys the job
you are watching. Liveness is the signal, not status.

**Use a separate database for local development.** The heartbeat stops the
job-killing; it does not stop a laptop from reading and writing production data.

---

## 9. API surface

```
POST   /api/generate               -> 202 { jobId }, work detached
GET    /api/generate               -> caller's jobs (RLS-scoped)
GET    /api/generate/[id]          -> job metadata
DELETE /api/generate/[id]          -> cancel; ?discard=true also deletes artifacts
GET    /api/generate/[id]/video    -> 302 to a short-lived signed URL
GET    /api/generate/[id]/captions -> WebVTT
GET/POST/PATCH /api/generate/[id]/quiz
GET    /api/health                 -> queue depth, slots, bundle cache state
```

Serve video by **redirecting to a signed storage URL**, never by proxying bytes.
Range requests then hit the CDN and playback traffic bypasses the app entirely.

**Validate the session once per request.** Middleware already verifies the JWT over
the network; have it pass the user id to handlers via a request header — stripping
any inbound copy first — instead of every handler calling `getUser()` again. The
status endpoint is polled continuously, so the duplicate call doubles auth traffic
for nothing.

---

## 10. Frontend

- **Compose** — one prominent input, example topics, collapsed advanced options
  (provider, model, depth, voice, retry budget, skip narration).
- **Library** — job list with live progress.
- **Studio** — `@remotion/player` for preview, a stage timeline with per-stage
  timings and expandable logs, cancel/discard, download.
- **Quiz** — generated from the lecture, graded with explanations.

Requirements:

- **Adaptive polling.** Widen the interval while progress is unchanged, snap back
  the moment it moves. A fixed 2s tick across a ten-minute render is ~300
  near-identical requests per viewer. A Postgres realtime subscription is better
  still.
- **Respect `prefers-reduced-motion`.** Any ambient animation must collapse
  entirely.
- Readable type. Resist 8px all-caps letterspaced labels and glow on every surface;
  they read as noise and destroy hierarchy.

---

## 11. Security

The renderer runs model-authored content, and web-research snippets feed the
generator — a prompt-injection path to whatever the renderer can reach.

- Schema-first scenes (§5.3) are the primary mitigation: validated data cannot
  execute. Keep the `custom` TSX escape hatch narrow, and off by default for
  untrusted users.
- Run Chromium sandboxed, as an unprivileged user, with no access to provider keys
  or the service-role key. Give child processes a minimal environment.
- Keep the browser off the network beyond the bundle it needs.
- Before opening public sign-ups, add real per-render isolation.

---

## 12. Deployment

Multi-stage Dockerfile; the final image carries no compilers.

- Next `output: 'standalone'`. Verify the trace actually captured native modules —
  an explicit `outputFileTracingIncludes` glob copies the files it matches but does
  **not** go on to trace that package's own dependencies, so listing roots alone
  yields a bundle that boots and then fails on first use. Compute the dependency
  closure programmatically.
- **Never `chown -R` a large directory.** Layers are additive, so it duplicates the
  entire tree into a second layer. Create the user first and use `COPY --chown`.
- **Strip foreign-platform binaries in the stage that produces them.** Deleting in
  a later layer adds a whiteout and reclaims nothing.
- Install Chromium's system dependencies per Remotion's documented list, and verify
  a render *inside* the built image — not only on the build host.
- `NEXT_PUBLIC_*` are inlined at build time and must be present as build args, or
  every route answers a configuration error at runtime.
- Health check `/api/health`; zero-overlap deploys, since the in-process queue must
  never briefly exist twice.

---

## 13. Bugs the predecessor hit — handle these explicitly

1. Concat of mixed audio / no-audio streams → §5.1 removes concat entirely.
2. `extractJson` slicing first-`{` to last-`}` → §6.3.
3. `provider/model` split applied to slash-bearing model ids → §6.1.
4. An env-var provider default ignored because the request had already been stamped
   with a hardcoded fallback → resolve defaults in exactly one place.
5. The reaper failing live jobs owned by another instance → §8.
6. A revoked key in a rotation list costing a request and a sleep every Nth call →
   §6.2.
7. Unbounded child-process output → cap head and tail; on failure it becomes LLM
   input.
8. Model preset lists naming models the account cannot call → verify presets
   against the provider's live catalogue, and remember that per-account gating
   means a public catalogue entry is not proof of access.

---

## 14. Deliverables

1. A working app: compose → plan → render → narrate → watch → quiz.
2. Migrations for schema, RLS, storage policies and the progress RPC.
3. `.env.example` documenting every variable with its default and effect.
4. A Dockerfile verified by building *and running a render inside* the image.
5. README covering setup, the single-instance constraint, and the Remotion
   licensing position.
6. A benchmark script reporting per-stage timings and correction-retry rate. The
   retry rate is the number that tells you whether the schema-first design is
   actually working.
