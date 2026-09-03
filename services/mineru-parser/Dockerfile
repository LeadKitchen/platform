FROM python:3.11-slim

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

# Pre-download MinerU's layout/OCR model weights at build time so the first
# real request doesn't pay a multi-minute (multi-GB) cold download. `yes |`
# auto-answers any interactive confirmation prompt the CLI may show; it is a
# no-op if there isn't one.
RUN yes | mineru-models-download -s huggingface -m all
# Use the weights just downloaded instead of re-checking a remote source on
# every request.
ENV MINERU_MODEL_SOURCE=local

COPY main.py .

RUN chown -R mineru:mineru /app
USER mineru

EXPOSE 8089
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8089"]
