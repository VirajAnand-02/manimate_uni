# Manimate — UI & Frontend Architecture

## Overview

Next.js 15 App Router, React 19, Tailwind CSS v4, Motion (Framer Motion v12), Lucide React icons. Full dark-theme, cyberpunk/terminal aesthetic.

---

## Routing Structure

| Route | Component | Purpose |
|---|---|---|
| `/` | `Dashboard.tsx` | Topic input, advanced config, job submission |
| `/studio` | `Studio.tsx` (default) | Fallback when no job selected |
| `/studio/[jobId]` | `Studio.tsx` | Real-time pipeline monitor |
| `/studio/[jobId]/quiz` | `Quiz.tsx` | Interactive mastery assessment |
| `/library` | `MyCourses.tsx` | Generated video library with search |
| `/quiz` | `Quiz.tsx` | Standalone quiz (error if no jobId) |

---

## Component Tree

```
RootLayout (layout.tsx)
├── Sidebar (fixed left, brand + navigation)
├── Main Content
│   ├── TopNav (dynamic title, search, notifications)
│   ├── PageTransition (animated mount)
│   │   └── [Page Component]
│   │       ├── Dashboard  (/)
│   │       ├── Studio     (/studio/:jobId)
│   │       ├── Quiz       (/studio/:jobId/quiz)
│   │       └── MyCourses  (/library)
│   └── Footer
├── bg effects: grid overlay, gradient overlays, animated glow blobs
```

---

## Page-by-Page Breakdown

### 1. Dashboard (`/`)

The command center / hero page.

- Animated hero card with gradient text "GENERATE MASTERCLASS"
- Topic text input with Sparkles icon + "Execute" button
- **Advanced config panel** (collapsible accordion):
  - LLM Provider: Mistral, OpenAI, Anthropic, Google, Custom
  - Model selector (dynamic by provider)
  - Topic Depth: brief / normal / deep
  - TTS Voice input (e.g. `af_heart`)
  - Correction Retries slider (1–10)
  - Skip Voiceover, Skip Web Research toggles
- Backend health monitor (polls `/api/health` every 15s)
- Social proof: "4.8k Active Neural Sessions"
- **Data flow**: Topic → `POST /api/generate` → receives `jobId` → navigates to `/studio/${jobId}`

### 2. Studio (`/studio/[jobId]`)

The main pipeline monitor — largest component at 711 lines.

- **Video Monitor**: 
  - Loading: spinner + "LOADING ARCHITECT..."
  - Error: alert + "PIPELINE ERROR"
  - Failed: "CONSTRUCT FAILED" + error message
  - Completed: native `<video>` with controls, autoplay
  - Running: HUD with animated progress bar, current stage message, elapsed timer
- **HUD overlays**: "720P_NEURAL_STREAM" badge, colored status dot
- **Video controls**: Download button, job title
- **Neural Script Construct card**: Module accordion list with scene breakdown, loading skeleton, summary bar
- **Build Pipeline sidebar**: 6-stage pipeline with icons, percentages, progress bars, messages, stage details, elapsed time. Rich detail per stage type (e.g., rendering shows failed scenes with error messages)
- **Neural Insight card**: Contextual quote based on status
- **Data flow**: Polls `GET /api/generate/${jobId}` every **2 seconds**

### 3. Quiz (`/studio/[jobId]/quiz`)

Progressive-difficulty MCQ assessment — 601 lines.

- **States**: Loading / Error / In Progress / Completed
- **In Progress**:
  - Header: back button, "Neural Assessment" title, difficulty tier, session timer (MM:SS)
  - Progress bar (current / total)
  - Question with "QUERY_NODE_0X" label
  - 4 options (A/B/C/D), brand-blue selection highlight
  - "Skip Question" + "Confirm Answer" buttons
  - After confirm: feedback panel with correct/incorrect/skipped + explanation
  - Animated transitions between questions
- **Completed**:
  - Summary card with Award icon, mastery level
  - "Generate Harder Questions" button
  - Stats grid: Total, Correct, Skipped, Concept Accuracy %
  - Question Ledger: full history per question with user response
- **API calls**: `GET` (fetch), `PATCH` (sync progress), `POST` (generate more)

### 4. MyCourses / Library (`/library`)

Catalog of all generated videos.

- **States**: Loading / Empty / No Results / Card Grid
- **Card grid**: Each generation shows thumbnail area, duration badge, job ID, topic title, status, "Monitor" / "Stream" / "Quiz" buttons
- **Sidebar analytics**: Core_Analytics card (constructs count, total jobs, yield %), Architect_Log quote
- **Search**: Reads `q` from URL params, filters by topic
- **Data flow**: `GET /api/generate` → list all jobs → render cards

---

## Layout Components

### Sidebar
- Fixed left (64px width), blocks overlay texture
- Brand logo + "Neural Architect" subtitle
- Navigation: Command Center (home), Neural Library
- Active state: animated pill indicator (spring `layoutId`)
- Version footer: "MANIMATE CORE V4.0.0"

### TopNav
- Dynamic title based on current route
- Studio indicator: "Active Construct: System: Neural_Physics_Core"
- SearchBar (writes to `/library?q=`), notification bell
- Background: `bg-black/60 backdrop-blur-2xl`

### Footer
- "Manimate_Terminal_v4" + "© 2024 Neural Architecture Labs"
- Links: Privacy, Terms, Contact

### PageTransition
- Framer Motion fade-in + y-offset on each route change
- 0.4s duration, custom cubic-bezier easing

---

## UI Primitives

### Button (`Button.tsx`)
- Variants: primary, secondary, ghost, outline, glass
- Sizes: sm, md, lg
- Animations: hover y: -2, tap scale: 0.96, primary has shine sweep effect
- Disabled: opacity-50 + pointer-events-none

### Card (`Card.tsx`)
- Variants: glass (`backdrop-blur`), solid, gradient
- Glow modes: blue, green, none
- Animations: hover y: -5 + scale 1.01 (if clickable)

---

## Styling Architecture

- **Tailwind CSS v4** with custom `brand-*` scale (base `#0c8ee9`)
- **Dark-only**: `bg-black text-zinc-300`
- **Fonts**: Inter (body), Plus Jakarta Sans (headings), JetBrains Mono (code)
- **Custom utilities**: `bg-grid` (40×40 grid), `bg-blocks` (dots), `glass`/`glass-dark`
- **Glow effects**: `glow-blue` / `glow-white` box-shadow
- **Icons**: Lucide React (~30 icons used)

---

## Data Flow Summary

```
Dashboard: Topic + Config → POST /api/generate → jobId → navigate to /studio/:jobId
Studio:    GET /api/generate/:jobId every 2s → render progress
Quiz:      GET /api/generate/:jobId/quiz on mount → PATCH answers → POST harder
Library:   GET /api/generate on mount → render cards
Video:     /api/generate/:jobId/video with HTTP Range support
Search:    URL param `?q=` → client-side filter
Health:    GET /api/health every 15s (Dashboard only)
```

---

## Key Design Decisions

1. **2-second polling** instead of WebSockets — simpler, sufficient for pipeline monitoring
2. **File-based state** — no DB needed, JSON files are the source of truth
3. **URL-based search** — enables shareable filtered library links
4. **Range-request video** — enables seeking in long lecture videos
5. **Dark theme + cyberpunk aesthetic** — aligns with the "neural/technical" brand identity
