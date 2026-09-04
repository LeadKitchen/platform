FROM python:3.11-slim@sha256:9534e5a8e315485d4061ed659af0fd78a284c015f9b73661b41d6bab25604534 AS models

ENV HOME=/app
WORKDIR /app
COPY requirements.txt download_models.py ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python download_models.py

FROM python:3.11-slim@sha256:9534e5a8e315485d4061ed659af0fd78a284c015f9b73661b41d6bab25604534

# libgl1: OpenCV/PaddleOCR (MinerU's pipeline backend) need it headless.
# fonts-noto-*/fontconfig: layout/OCR accuracy on non-Latin scripts and
# general glyph coverage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    fonts-noto-core \
    fonts-noto-cjk \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Non-root user the service ends up running as. HOME=/app so every cache
# written during the build (pip, MinerU's own downloaded model weights)
# lands under a directory this user can read at runtime instead of /root.
RUN groupadd --system mineru \
    && useradd --system --gid mineru --home-dir /app --no-create-home mineru
ENV HOME=/app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model files materialized from immutable Hugging Face revisions in the
# build stage. Runtime parsing never checks or downloads a remote revision.
COPY --from=models /app/models /app/models
COPY --from=models /app/mineru.json /app/mineru.json
ENV MINERU_MODEL_SOURCE=local

COPY main.py .

RUN chown -R mineru:mineru /app
USER mineru

EXPOSE 8089
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8089"]
