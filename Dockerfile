# Manimate runs Next.js and the Manim/ffmpeg/Kokoro render pipeline in one
# long-lived container. It cannot be deployed to Vercel or any serverless host:
# renders take minutes, spawn Python subprocesses, and need a writable disk.
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ─── System dependencies ─────────────────────────────────────────────
# cairo and pango are hard requirements of manim (pycairo / manimpango) — every
# generated scene uses Text, which fails without them. The texlive subset covers
# MathTex; full TeX Live would add ~4GB for little extra coverage here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev \
      build-essential pkg-config \
      libcairo2-dev libpango1.0-dev \
      ffmpeg \
      dvisvgm \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
      texlive-science \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Manim ───────────────────────────────────────────────────────────
ENV MANIM_PYTHON=/opt/manim-env/bin/python
RUN python3 -m venv /opt/manim-env \
    && /opt/manim-env/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/manim-env/bin/pip install --no-cache-dir manim \
    && /opt/manim-env/bin/python -m manim --version

WORKDIR /app

# ─── Node dependencies ───────────────────────────────────────────────
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

RUN npm run build && npm prune --omit=dev

# ─── Kokoro TTS weights ──────────────────────────────────────────────
# ~300MB pulled from HuggingFace on first use. Baking them in keeps the first
# render from stalling (or failing outright on a host without egress to HF).
ENV HF_HOME=/opt/hf-cache
RUN mkdir -p $HF_HOME && node scripts/prewarm-tts.mjs

# ─── Runtime ─────────────────────────────────────────────────────────
ENV NODE_ENV=production \
    PORT=3000 \
    MANIMATE_WORK_DIR=/var/tmp/manimate \
    MANIM_QUALITY=-qm

# Renders execute LLM-generated Python. Run as an unprivileged user so the
# container boundary is doing real work.
RUN useradd --create-home --uid 10001 manimate \
    && mkdir -p /var/tmp/manimate \
    && chown -R manimate:manimate /var/tmp/manimate /opt/hf-cache /app
USER manimate

EXPOSE 3000
CMD ["npm", "start"]
