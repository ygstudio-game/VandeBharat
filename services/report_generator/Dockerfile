FROM python:3.10-slim

WORKDIR /app

COPY services/report_generator/requirements.txt services/report_generator/requirements.txt
RUN pip install --no-cache-dir -r services/report_generator/requirements.txt

COPY GPU/shared/ GPU/shared/
COPY services/report_generator/ services/report_generator/

WORKDIR /app/services/report_generator

EXPOSE 5006
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5006"]
