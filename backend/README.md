# VantAIge Live API Bridge (Python)

WebSocket server that connects the Next.js frontend to the Gemini Multimodal Live API using the [google-genai](https://pypi.org/project/google-genai/) Python SDK via **Vertex AI**.

## Setup

1. **Python**: Use Python 3.10+ (3.12+ recommended).

2. **Create and activate a virtual environment** (recommended):

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Linux/macOS
   # or: .venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

   Or install into the existing venv from project root:

   ```bash
   backend/.venv/bin/pip install -r backend/requirements.txt
   ```

3. **Vertex AI Authentication**: This bridge uses Application Default Credentials (ADC):

   ```bash
   # One-time: log in with your Google Cloud account
   gcloud auth application-default login

   # Set your project ID and region in .env.local (project root):
   GOOGLE_CLOUD_PROJECT=your_gcp_project_id
   GOOGLE_CLOUD_LOCATION=us-central1
   ```

   The server reads `GOOGLE_CLOUD_PROJECT` (required) and `GOOGLE_CLOUD_LOCATION` (defaults to `us-central1`).

   > **Note**: Ensure the Vertex AI API is enabled in your GCP project:
   > `gcloud services enable aiplatform.googleapis.com`

## Run

With the venv activated (from `backend/`):

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or without activating (use venv's uvicorn):

```bash
cd backend && .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or with module syntax from root:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
(requires `PYTHONPATH=.` or running from a directory that has `backend` as a subdirectory)

- **WebSocket endpoint**: `ws://localhost:8000/ws`
- In the Next.js app, set `NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws` in `.env.local` so the frontend connects to this backend.

## Message contract

- **Client → server**: First message must be `{"setup": { ... }}`. Then: `realtimeInput` (audio/image base64), `clientContent` (turns + turnComplete), `toolResponse` (functionResponses).
- **Server → client**: `setupComplete`, `serverContent` (modelTurn, turnComplete, interrupted, transcriptions), `toolCall`, `error`.

Same shapes as the previous Node proxy so the frontend does not need message-format changes.
