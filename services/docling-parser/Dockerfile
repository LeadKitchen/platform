FROM python:3.11-slim

# poppler-utils: PDF rendering Docling's backend shells out to.
# tesseract-ocr: default OCR engine for scanned pages.
# libgl1/libglib2.0-0: runtime libs opencv (a Docling dependency) needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Docling's layout/table-structure models at build time so the
# first real request doesn't pay a multi-minute cold download.
RUN python -c "from docling.document_converter import DocumentConverter; DocumentConverter()"

COPY main.py .

EXPOSE 8088
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088"]
