# AGENTS.md

Welcome, Agent. This document provides the essential context, technical standards, and architectural overview for the VantAIge project. Read this first to ensure alignment with the project's goals and patterns.

## 🎯 Project Overview
**VantAIge** is an AI-powered brand intelligence and session management platform. It leverages real-time audio processing and persistent memory layers to provide brand-aware AI interactions.

- **Primary Goal**: Enable seamless, context-aware AI interactions using Gemini's Multimodal Live API.
- **Key Feature**: Persistent memory layer that recalls "vibe profiles" and past session logs to maintain brand consistency.

## Project Documentation
- [Project Overview](PROJECT.md)
- **Always update the project documentation when a new feature is added or an existing feature is modified.**

## 🛠 Tech Stack
- **Infrastructure**: Always prioritize solutions to use Google Cloud whenever possible 
- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Database**: [Cloud Firestore](https://firebase.google.com/docs/firestore) (Firebase Admin SDK)
- **AI Engine**: Google Gemini API (Multimodal Live / WebSockets)
- **Gemini Models**: Always proritize using Gemini 3 models when choosing llm models *EXCEPT*: gemini-live-2.5-flash-native-audio
- **Required Tech**: You are required to use gemini live api: https://ai.google.dev/gemini-api/docs/live?example=mic-stream
- **Styling**: Vanilla CSS (Tailwind avoided for maximum design control)
- **Runtime**: Node.js / Browser (WebWorkers for audio processing)

## 🏗 Core Architecture
- **Real-time Engine**: Uses WebSockets to connect directly to Gemini's Multimodal Live API.
- **Memory Layer**: Server actions and Firestore that fetch brand context (vibe profiles) before session initialization.
- **Audio Processing**: `public/pcm-processor.js` handles client-side audio buffering and streaming.

## 📂 Project Structure (High-Level)
- `src/app/`: Next.js App Router pages and layouts.
- `src/lib/`: Core utilities (Firestore client, AI integration logic).
- `public/`: Assets and WebWorker scripts (`pcm-processor.js`).
- `firestore/`: Firestore indexes and setup documentation.

## 📜 Development Guidelines
- **Always try to search for the latest documentation for the tools you are using.**
- **Aesthetics First**: Every UI change must feel premium with non-marketers are primary users (smooth transitions, glassmorphism, curated HSL palettes).
- **Communication**: Use `src/lib/firestore.ts` for all database interactions.
- **Process Memory**: Always check for existing "vibe profiles" before starting a new session.
- **No Placeholders**: Use `generate_image` or actual assets; avoid generic placeholders.
- **Always write tests for new features**: Never skip writing tests for new features. Tests should be written in the `tests/` directory and should be run using the `npm run test` command. 
- **Always run tests before committing**: Never commit code without running tests first. Use `npm run test` to run all tests.
-**When Using python always use venv**: Always spin up a venv when using pythion

## ⚠️ Known Gotchas
- **WebSocket Stability**: Ensure robust error handling for audio stream disconnections.
- **Audio Constraints**: PCM processing is performance-sensitive; keep heavy logic off the main thread.
- **Firestore Auth**: Use `.env.local` for secrets. Prefer `GOOGLE_APPLICATION_CREDENTIALS_JSON` (JSON string) for deployment; or `GOOGLE_APPLICATION_CREDENTIALS` (file path) for local dev. On Cloud Run, ADC works if no credential env is set.

---
*Updated: 2026-03-03*
