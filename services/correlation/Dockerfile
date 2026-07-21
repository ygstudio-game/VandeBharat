FROM python:3.10-slim

WORKDIR /app

COPY services/correlation/requirements.txt services/correlation/requirements.txt
RUN pip install --no-cache-dir -r services/correlation/requirements.txt

COPY GPU/shared/ GPU/shared/
COPY services/correlation/ services/correlation/

WORKDIR /app/services/correlation

EXPOSE 5005
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5005"]
