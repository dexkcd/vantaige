# 🦅 VantAIge: The Strategic Brand Engine

**Status**: Alpha / Active Development
**Stack**: Next.js, Supabase, Gemini Multimodal Live via Vertex AI (WebSockets)

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
- [x] **Vibe Profile (JSONB)**: Persistent brand DNA storage
- [x] Session Continuity: Recalling past decisions & palettes
- [x] Real-time Updates: `upsert_vibe_profile` mid-call
- [x] Cross-session trend analysis (Gemini analysis over session logs + roadmap)

### 4. 🎨 Real-Time Execution
- [x] **Nano Banana** Asset Gen: Image generation during live calls (Gemini 3 Pro Image Preview)
- [ ] Launch Pack Sidebar: Pinned assets & copy for review
- [x] Strategic Grounding: Google Search integration for trends

### 5. 🔄 The "Refine" Loop (Agentic Workflow)
- [x] Kanban Bridge: Turning ideas into "Draft Plans" (AI `create_kanban_task` tool + Strategy Flow UI)
- [ ] **Next**: The "Recall" Button: Restarting sessions with specific mission context

---

## 🏗 Technical Architecture

### Backend vs frontend (no redundancy)
- **Python backend (`backend/`)**  
  **Only** the WebSocket bridge to the Gemini Multimodal Live API. It forwards audio/video and client/setup messages; it does not run business logic or execute tools. Required for real-time voice/video.
- **Next.js (frontend + server actions)**  
  UI, Supabase (vibe profiles, session logs, assets, kanban), and **Gemini REST** for summarization and image generation. When the Live session returns a tool call (e.g. `generate_brand_asset`), the client calls these server actions and sends the result back over the same WebSocket to the backend → Gemini.  
  So: Live API = Python; REST + DB = Next.js. Two places configure Gemini (backend for Live, server actions for REST) by design.

### Data Flow
1. **Input**: Client captures Audio (Mic) + Frames (Canvas)
2. **Gateway**: Python backend (`backend/`) runs a WebSocket server and connects to Gemini via the google-genai SDK with Vertex AI (ADC auth). Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws`. Run `cd backend && uvicorn main:app --reload --port 8000`.
3. **Context**: Server Action fetches `vibe_profile` from Supabase and injects it into the `setup` message
4. **Brain**: Gemini processes multimodal stream + tools (Search, Image Gen)
5. **Output**: Real-time audio + tool-call responses to update UI/DB

### Key Files
- `backend/main.py`: WebSocket bridge (Live API session per client); `backend/config.py`: setup → SDK config mapping
- `server.js`: HTTP server for Next.js (no WebSocket; use Python backend for Live API)
- `src/app/page.tsx`: The main "Studio" UI & stream management
- `src/lib/supabase.ts`: Database client & schema helpers
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
1.  Check the Supabase schema in `supabase/` (usually managed via SQL scripts).
2.  Update the `vibe_profile` JSONB structure in `src/lib/supabase.ts`.
3.  Ensure `upsert_vibe_profile` is called when significant brand decisions are made.

---
*Reference: See [AGENTS.md](AGENTS.md) for detailed coding standards and workflow details.*
*Last Updated: 2026-02-28*