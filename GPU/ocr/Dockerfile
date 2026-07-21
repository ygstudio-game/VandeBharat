FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY GPU/ocr/requirements.txt GPU/ocr/requirements.txt
# Strip comment lines before pip install (requirements has inline # GPU: notes)
RUN grep -v "^#" GPU/ocr/requirements.txt | pip install --no-cache-dir -r /dev/stdin

COPY GPU/shared/ GPU/shared/
COPY GPU/ocr/ GPU/ocr/

WORKDIR /app/GPU/ocr

EXPOSE 5000
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]
