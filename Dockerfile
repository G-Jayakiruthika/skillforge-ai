# SkillForge AI — production image.
#
# Build:  docker build -t skillforge-ai .
# Run:    docker run -p 8000:8000 --env-file backend/.env -v skillforge-data:/data skillforge-ai
#
# The image serves both the API and the frontend from one process, so there is
# no separate web server to configure.

FROM python:3.12-slim AS base

# Fail fast and keep the image small and quiet.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so a code change does not rebuild this layer.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY frontend/ frontend/

# Run as a non-root user; give it the data directory only.
RUN useradd --system --create-home --uid 10001 skillforge \
    && mkdir -p /data \
    && chown -R skillforge:skillforge /data /app
USER skillforge

# Database lives on a volume so it survives a redeploy.
ENV SKILLFORGE_DB=/data/skillforge.db \
    SKILLFORGE_PUBLIC=1 \
    PORT=8000
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/api/health', timeout=4).status==200 else 1)"

WORKDIR /app/backend
# One worker on purpose: the SQLite database and the in-process rate limiter are
# not shared between workers. Scale with more than one worker only after moving
# the store to Postgres — see docs/DEPLOYMENT.md.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
