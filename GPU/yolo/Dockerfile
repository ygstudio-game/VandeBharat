FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PyTorch first — large wheel, isolated layer so it only re-downloads on version bump.
# Switch index URL to /whl/cpu if the host has no NVIDIA GPU.
ARG TORCH_INDEX=https://download.pytorch.org/whl/cu124
RUN pip install --no-cache-dir \
    torch==2.6.0 torchvision==0.21.0 \
    --index-url ${TORCH_INDEX}

COPY GPU/yolo/requirements.txt GPU/yolo/requirements.txt
RUN grep -v "^#" GPU/yolo/requirements.txt | pip install --no-cache-dir -r /dev/stdin

COPY GPU/shared/ GPU/shared/
COPY GPU/yolo/ GPU/yolo/

WORKDIR /app/GPU/yolo

# Model weights are mounted at runtime — not baked into the image.
# Mount: /srv/vandebharat/models → /models  (see docker-compose.prod.yml)
ENV YOLO_MODEL_PATH=/models/best.pt
ENV YOLO_OCR_MODEL_PATH=/models/train_num_detector.pt

EXPOSE 5002
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5002"]
