# VantAIge Live API Bridge (Python)

WebSocket server that connects the Next.js frontend to the Gemini Multimodal Live API using the [google-genai](https://pypi.org/project/google-genai/) Python SDK. Supports **Vertex AI** (recommended for `gemini-live-2.5-flash-native-audio`) or **Gemini API** (API key).

- [Vertex AI Live API overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api)

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

3. **Authentication** (choose one):

   **Option A – Vertex AI** (recommended for `gemini-live-2.5-flash-native-audio`):

   ```bash
   gcloud auth application-default login
   ```

   In `.env.local` (project root):

   ```bash
   GOOGLE_CLOUD_PROJECT=your_gcp_project_id
   GOOGLE_CLOUD_LOCATION=us-central1
   ```

   Ensure the Vertex AI API is enabled: `gcloud services enable aiplatform.googleapis.com`

   **Option B – Gemini API (API key):**

   In `.env.local`:

   ```bash
   GEMINI_API_KEY=your_key_here
   ```

   Note: The model `gemini-live-2.5-flash-native-audio` is **only available on Vertex AI**. With an API key you must use a different Live model (e.g. from [Google AI Studio](https://aistudio.google.com/app/live)).

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
