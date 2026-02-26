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
- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Database / Auth**: [Supabase](https://supabase.com/)
- **AI Engine**: Google Gemini API (Multimodal Live / WebSockets)
- **Styling**: Vanilla CSS (Tailwind avoided for maximum design control)
- **Runtime**: Node.js / Browser (WebWorkers for audio processing)

## 🏗 Core Architecture
- **Real-time Engine**: Uses WebSockets to connect directly to Gemini's Multimodal Live API.
- **Memory Layer**: Server actions and Supabase hooks that fetch brand context (vibe profiles) before session initialization.
- **Audio Processing**: `public/pcm-processor.js` handles client-side audio buffering and streaming.

## 📂 Project Structure (High-Level)
- `src/app/`: Next.js App Router pages and layouts.
- `src/lib/`: Core utilities (Supabase client, AI integration logic).
- `public/`: Assets and WebWorker scripts (`pcm-processor.js`).
- `supabase/`: Database schemas, migrations, and SQL setup scripts.

## 📜 Development Guidelines
- **Aesthetics First**: Every UI change must feel premium with non-marketers are primary users (smooth transitions, glassmorphism, curated HSL palettes).
- **Communication**: Use `src/lib/supabase.ts` for all database interactions.
- **Process Memory**: Always check for existing "vibe profiles" before starting a new session.
- **No Placeholders**: Use `generate_image` or actual assets; avoid generic placeholders.
- **Always write tests for new features**: Never skip writing tests for new features. Tests should be written in the `tests/` directory and should be run using the `npm run test` command. 
- **Always run tests before committing**: Never commit code without running tests first. Use `npm run test` to run all tests.

## ⚠️ Known Gotchas
- **WebSocket Stability**: Ensure robust error handling for audio stream disconnections.
- **Audio Constraints**: PCM processing is performance-sensitive; keep heavy logic off the main thread.
- **Supabase Local Env**: Use `.env.local` for secrets; do not commit actual keys.

---
*Updated: 2026-02-26*
