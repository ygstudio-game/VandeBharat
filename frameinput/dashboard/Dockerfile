FROM python:3.11-slim-bookworm
WORKDIR /app
COPY dashboard/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY dashboard/ ./dashboard/
ENV PYTHONPATH=/app
CMD ["uvicorn", "dashboard.server:app", "--host", "0.0.0.0", "--port", "5000", "--log-level", "info"]
