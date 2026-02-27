# VantAIge Live API Bridge (Python)

WebSocket server that connects the Next.js frontend to the Gemini Multimodal Live API using the [google-genai](https://pypi.org/project/google-genai/) Python SDK.

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

3. **API key**: Set your Gemini API key (from [Google AI Studio](https://aistudio.google.com/app/apikey)):

   - In project root `.env.local`:
     ```bash
     GEMINI_API_KEY=your_key_here
     ```
   - Or in `backend/.env`, or export:
     ```bash
     export GEMINI_API_KEY=your_key_here
     ```
   The server also accepts `GOOGLE_API_KEY`.

## Run

With the venv activated (from `backend/`):

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or without activating (use venv’s uvicorn):

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

## Optional: Vertex AI

The plan and notebook use Vertex AI in some examples. This bridge is built for **API key** auth. To use Vertex later you would:

- Install and configure `google-cloud-aiplatform` and ADC (Application Default Credentials).
- Use `genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)` in `main.py` instead of `genai.Client(api_key=...)`.
- Ensure the frontend setup `model` matches a Vertex Live model name (e.g. `gemini-live-2.5-flash-native-audio`).

## Message contract

- **Client → server**: First message must be `{"setup": { ... }}`. Then: `realtimeInput` (audio/image base64), `clientContent` (turns + turnComplete), `toolResponse` (functionResponses).
- **Server → client**: `setupComplete`, `serverContent` (modelTurn, turnComplete, interrupted, transcriptions), `toolCall`, `error`.

Same shapes as the previous Node proxy so the frontend does not need message-format changes.
