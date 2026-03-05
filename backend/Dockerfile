# VantAIge WebSocket Bridge – Cloud Run
# Python FastAPI backend for Gemini Multimodal Live API

FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY config.py .
COPY main.py .

# Cloud Run sets PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

# Uvicorn: bind to 0.0.0.0 so Cloud Run can route traffic
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
