# Manimate runs Next.js and the Manim/ffmpeg/Kokoro render pipeline in one
# long-lived container. It cannot be deployed to Vercel or any serverless host:
# renders take minutes, spawn Python subprocesses, and need a writable disk.
#
# Three stages so the compilers and dev headers needed to build Manim's native
# extensions, and the full node_modules needed to build Next, stay out of the
# shipped image.

# ─── Stage 1: build the Manim virtualenv ─────────────────────────────
FROM node:20-bookworm-slim AS pybuild

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev \
      build-essential pkg-config \
      libcairo2-dev libpango1.0-dev \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/manim-env \
    && /opt/manim-env/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/manim-env/bin/pip install --no-cache-dir manim \
    && /opt/manim-env/bin/python -m manim --version


# ─── Stage 2: build the Next application ─────────────────────────────
FROM node:20-bookworm-slim AS nodebuild

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so the
# Supabase URL and anon key must be present *here*, not only at runtime.
# Railway/Render expose service env vars to the build automatically; on Fly pass
#   --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# next.config.ts sets output: 'standalone', so this produces .next/standalone
# containing server.js plus only the dependencies file tracing actually found.
RUN npm run build

# onnxruntime-node ships prebuilt binaries for every platform it supports —
# 536MB, of which ~133MB is darwin and win32 and useless in a Linux container.
# Pruned here rather than in the runtime stage: deleting files in a later layer
# does not reclaim the space, it only adds a whiteout.
RUN P=$(node -p "process.platform") && A=$(node -p "process.arch") \
    && cd .next/standalone/node_modules/onnxruntime-node/bin/napi-v3 \
    && find . -mindepth 1 -maxdepth 1 -type d ! -name "$P" -exec rm -rf {} + \
    && find "$P" -mindepth 1 -maxdepth 1 -type d ! -name "$A" -exec rm -rf {} + \
    && echo "kept onnxruntime binaries for $P/$A"

# ~300MB pulled from HuggingFace on first use. Baking them in keeps the first
# render from stalling (or failing outright on a host without egress to HF).
ENV HF_HOME=/opt/hf-cache
RUN mkdir -p $HF_HOME && node scripts/prewarm-tts.mjs


# ─── Stage 3: runtime ────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# Runtime counterparts only — no compilers, no -dev headers. cairo and pango are
# hard requirements of manim (pycairo / manimpango); the texlive subset covers
# MathTex, and full TeX Live would add ~4GB for little extra coverage here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      libcairo2 \
      libpango-1.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 \
      libgdk-pixbuf-2.0-0 \
      ffmpeg \
      dvisvgm \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
      texlive-science \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Renders execute LLM-generated Python. Run as an unprivileged user so the
# container boundary is doing real work. Created before the COPYs so ownership
# can be set as files land — `chown -R /app` afterwards would duplicate the
# entire ~800MB tree into a second layer.
RUN useradd --create-home --uid 10001 manimate \
    && mkdir -p /var/tmp/manimate \
    && chown manimate:manimate /var/tmp/manimate

ENV MANIM_PYTHON=/opt/manim-env/bin/python
# Left root-owned: executed, never written to.
COPY --from=pybuild /opt/manim-env /opt/manim-env

WORKDIR /app

# The standalone bundle already contains the traced node_modules and server.js;
# static assets are not traced and have to come across separately. (There is no
# public/ directory in this project; add a COPY for it if one is ever created.)
COPY --from=nodebuild /app/.next/standalone ./
COPY --from=nodebuild /app/.next/static ./.next/static
# transformers writes into its cache directory at runtime, so this one is owned
# by the runtime user.
COPY --from=nodebuild --chown=manimate:manimate /opt/hf-cache /opt/hf-cache

# scripts/ is not part of the traced bundle but prewarm-tts.mjs is useful for
# re-warming the cache by hand on a running container.
COPY --from=nodebuild /app/scripts ./scripts

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HF_HOME=/opt/hf-cache \
    MANIMATE_WORK_DIR=/var/tmp/manimate \
    MANIM_QUALITY=-qm

USER manimate

EXPOSE 3000

# standalone ships its own server; `next start` is not available here.
CMD ["node", "server.js"]
