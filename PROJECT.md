# 🦅 VantAIge: The Strategic Brand Engine

**Status**: Alpha / Active Development
**Stack**: Next.js, Cloud Firestore, Gemini Multimodal Live via Vertex AI (WebSockets)

VantAIge is an AI-powered "Marketing Director" that combines real-time situational awareness (vision/audio) with a deep, persistent memory of brand identity (Vibe Profiles).

---

## 🎯 Core Mission
Transition AI from a "chat box" to a proactive partner that understands physical products, digital designs, and brand DNA simultaneously.

## 🛠 Feature Roadmap & Status

### 1. 👁️ The "Live Vision" Engine
- [x] Dual-Stream Input (Webcam + Screen-Share)
- [x] Low-Latency Compositor (1FPS Gemini Stream)
- [x] Proactive Visual Auditing (Interruption logic for brand mismatches)

### 2. 🎙️ High-Fidelity Interaction (The "Director")
- [x] True Barge-in Support (VAD-driven buffer clearing)
- [ ] Affective Intelligence (Tone detection & adaptation)
- [x] Zero-Latency Hand-off (Syncing UI assets with voice)

### 3. 🧠 Strategic Brain (Memory Layer)
- [x] **Vibe Profile**: Persistent brand DNA storage (Firestore)
- [x] Session Continuity: Recalling past decisions & palettes
- [x] Real-time Updates: `upsert_vibe_profile` mid-call
- [x] Cross-session trend analysis (Gemini analysis over session logs + roadmap)

### 4. 🎨 Real-Time Execution
- [x] **Nano Banana** Asset Gen: Image generation during live calls (Imagen 4.0 via Vertex AI)
- [x] **Short-Form Video**: TikTok/YouTube Shorts (9:16) via [Veo 3.1](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate). Reference brand assets for visual consistency. Videos are 4, 6, or 8 seconds.
- [ ] Launch Pack Sidebar: Pinned assets & copy for review
- [x] Strategic Grounding: Google Search integration for trends

### 5. 🔄 The "Refine" Loop (Agentic Workflow)
- [x] Kanban Bridge: Turning ideas into "Draft Plans" (AI `create_kanban_task` tool + Strategy Flow UI)
- [x] Roadmap Task Detail View: Clickable cards with modal; image posts (image, caption, tags); video posts (TikTok/YouTube Shorts via `video_asset_id`); status workflow (draft, pending, in progress, done)
- [x] **Session Management**: New session creates passcode; Continue session restores by passcode. Documents owned by session.
- [ ] **Next**: The "Recall" Button: Restarting sessions with specific mission context

---

## 🏗 Technical Architecture

### Backend vs frontend (no redundancy)
- **Python backend (`backend/`)**  
  **Only** the WebSocket bridge to the Gemini Multimodal Live API. It forwards audio/video and client/setup messages; it does not run business logic or execute tools. Required for real-time voice/video.
- **Next.js (frontend + server actions)**  
  UI, Firestore (vibe profiles, session logs, assets, short videos, kanban), and **Gemini REST** for summarization, image generation (Imagen), and video generation (Veo 3.1). When the Live session returns a tool call (e.g. `generate_brand_asset`, `generate_short_form_video`), the client calls these server actions and sends the result back over the same WebSocket to the backend → Gemini.  
  So: Live API = Python; REST + DB = Next.js. Two places configure Gemini (backend for Live, server actions for REST) by design.

### Session Flow
1. **Landing**: User chooses **New Session** (creates passcode) or **Continue Session** (enters passcode).
2. **Scope**: All data (vibe profiles, session logs, marketing plans, brand assets, short videos) is scoped by `session_id`. Passcode maps to session via `sessions` collection.
3. **Connect**: Once a session is active, user can connect to the Live API and run the Studio.

### Data Flow
1. **Input**: Client captures Audio (Mic) + Frames (Canvas)
2. **Gateway**: Python backend (`backend/`) runs a WebSocket server and connects to Gemini via the google-genai SDK with Vertex AI (ADC auth). Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws`. Run `cd backend && uvicorn main:app --reload --port 8000`.
3. **Context**: Server Action fetches `vibe_profile` from Firestore (by session scope) and injects it into the `setup` message
4. **Brain**: Gemini processes multimodal stream + tools (Search, Image Gen)
5. **Output**: Real-time audio + tool-call responses to update UI/DB

### Key Files
- `backend/main.py`: WebSocket bridge (Live API session per client); `backend/config.py`: setup → SDK config mapping
- `server.js`: HTTP server for Next.js (no WebSocket; use Python backend for Live API)
- `src/app/page.tsx`: The main "Studio" UI & stream management
- `src/app/actions/memory.ts`: Server actions (Imagen, Veo 3.1, Firestore, summarization)
- `src/lib/firestore.ts`: Database client & Firestore collections (sessions, vibe_profiles, session_logs, brand_assets, short_videos, marketing_plans)
- `src/lib/storage.ts`: Brand asset images & signed URLs for Veo video output
- `src/components/ShortsSidebar.tsx`: Short-form video display (Launch Pack → Shorts tab)
- `public/pcm-processor.js`: Low-level audio handling

## 📜 Agent Guidelines
- **Always** prioritize the "Vibe Profile" when making design suggestions.
- **Never** use generic placeholders; generate assets or use the brand's HSL tokens.
- **WebSocket Safety**: Always clear buffers on disruption to prevent audio loops.

---

## 🚀 How to Extend

### Adding a New Tool
1.  Define the tool logic in the Gemini session configuration within `page.tsx` or a dedicated server action.
2.  Update the `setup` message in `server.js` if the tool requires specific permissions.
3.  Add the tool's output handler in the client-side `onMessage` loop.

### Modifying the Memory Layer
1.  Check the Firestore schema in `firestore/` and `src/lib/firestore.ts`.
2.  Update the `VibeProfile` interface in `src/lib/firestore.ts` if needed.
3.  Ensure `upsertVibeProfile` is called when significant brand decisions are made.

---

## ☁️ Deployment (Google Cloud Run)

VantAIge deploys as two Cloud Run services: the Next.js web app and the Python WebSocket bridge.

### Prerequisites
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- Google Cloud project with billing enabled
- APIs enabled: `run.googleapis.com`, `cloudbuild.googleapis.com`

### Deploy
```bash
# From project root; uses GOOGLE_CLOUD_PROJECT from .env.local by default
./scripts/deploy-cloud-run.sh
```

Or manually:

1. **WebSocket backend** (deploy first to get URL):
   ```bash
   cd backend && gcloud run deploy vantaige-ws --source . --region us-central1 --allow-unauthenticated
   ```

2. **Next.js app** (needs WebSocket URL for `NEXT_PUBLIC_WS_URL` at build time):
   ```bash
   gcloud builds submit --config=cloudbuild-web.yaml --substitutions="_WS_URL=wss://YOUR-WS-URL/ws,_REGION=us-central1"
   gcloud run deploy vantaige --image gcr.io/PROJECT_ID/vantaige:SHORT_SHA --region us-central1 --allow-unauthenticated
   ```

### Environment
- **Build-time** (baked into Next.js): `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Runtime**: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` (set by deploy script)
- **Credentials**: Use `GOOGLE_APPLICATION_CREDENTIALS_JSON` (full JSON string) for secure deployment—no credential files. Store in Secret Manager and reference from Cloud Run. If unset, Cloud Run uses Application Default Credentials (default service account).

### IAM
**Cloud Build** (source deploy) – the Compute Engine default service account needs:
```bash
PROJECT_ID="vantaige-417aa"  # or your project
SA="PROJECT_NUMBER-compute@developer.gserviceaccount.com"  # e.g. 923420874741-compute@...

gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/run.builder"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/storage.objectViewer"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/artifactregistry.writer"  # for pushing images to Artifact Registry

# Required for Cloud Build to deploy to Cloud Run (actAs permission)
gcloud iam service-accounts add-iam-policy-binding $SA \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID
```

**Cloud Run** – for Firestore (vibe profile, session logs, brand assets, short videos), Vertex AI (Gemini summarization, Imagen, Veo 3.1), and Firebase Storage (brand assets, Veo output), grant to the runtime service account:
```bash
PROJECT_ID="vantaige-417aa"
SA="923420874741-compute@developer.gserviceaccount.com"  # Default Cloud Run SA

# Firestore read/write
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/datastore.user"

# Vertex AI (Gemini) for summarization, image gen, etc.
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/aiplatform.user"

# Firebase Storage for brand assets and Veo video output (gs://{projectId}.firebasestorage.app/)
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"
```

**Firestore indexes**: The `short_videos` collection requires a composite index. Deploy with `firebase deploy --only firestore:indexes`, or create it via the [Firebase Console](https://console.firebase.google.com) when prompted. See `firestore/DEPLOY_INDEX.md`.

---
*Reference: See [AGENTS.md](AGENTS.md) for detailed coding standards and workflow details.*
*Last Updated: 2026-03-05*