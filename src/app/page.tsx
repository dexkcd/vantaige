'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompositor } from '@/hooks/useCompositor';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { Mic, MicOff, Video, VideoOff, Monitor, Play, Square, Loader2, Cpu, AlertCircle, TrendingUp, X, Trash2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchVantAIgeContext,
  upsertVibeProfileAction,
  summarizeSessionAction,
  generateBrandAssetAction,
  createKanbanTaskAction,
  updateKanbanTaskStatusAction,
  deleteKanbanTaskAction,
  saveBrandAssetAction,
  fetchBrandAssetsAction,
  fetchKanbanTasksAction,
  getCrossSessionTrendAnalysisAction,
  startShortFormVideoAction,
  checkShortFormVideoStatusAction,
  fetchShortVideosAction,
  deleteShortVideoAction,
  createSessionAction,
  getSessionByPasscodeAction,
} from './actions/memory';
import { compressBase64Image } from '@/lib/compressImage';
import LaunchPackSidebar, { BrandAsset } from '@/components/LaunchPackSidebar';

function toDisplayUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
    return `/api/asset?url=${encodeURIComponent(imageUrl)}`;
  }
  return imageUrl;
}
import ShortsSidebar from '@/components/ShortsSidebar';

// Types
interface ToolCall {
  name: string;
  args: any;
  id: string;
}

export type KanbanTaskStatus = 'draft' | 'pending' | 'in_progress' | 'done';

export interface KanbanTask {
  id: string;
  title: string;
  platform: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  image_url?: string;
  video_url?: string;
  caption?: string;
  tags?: string[];
  status: KanbanTaskStatus;
}

const priorityColors: Record<string, string> = {
  high: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  low: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};

const statusColors: Record<KanbanTaskStatus, string> = {
  draft: 'text-neutral-400 border-neutral-600/50 bg-neutral-700/20',
  pending: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  in_progress: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  done: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};

const statusLabels: Record<KanbanTaskStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};

export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const [brandIdentity, setBrandIdentity] = useState<string>('Vibrant, futuristic AI brand');
  const [isPulsing, setIsPulsing] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // New state for Live Execution Bridge
  const [isToolPending, setIsToolPending] = useState(false);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [shortVideos, setShortVideos] = useState<Array<{ id: string; prompt: string; status: 'generating' | 'done' | 'error'; videoUrl?: string }>>([]);
  const [shortVideoError, setShortVideoError] = useState<string | null>(null);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);

  // Cross-session trend analysis
  const [trendAnalysis, setTrendAnalysis] = useState<string | null>(null);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  // Video is sent automatically when screen or camera is on (no separate toggle)

  // Debug log
  const [debugLogs, setDebugLogs] = useState<{ ts: string; type: string; msg: string }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const debugEndRef = useRef<HTMLDivElement | null>(null);
  const dbg = (type: string, msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setDebugLogs(prev => [...prev.slice(-199), { ts, type, msg }]);
  };

  // Track events for summarization
  const sessionNotesRef = useRef<string[]>([]);

  // Dedupe tool calls: Gemini may send the same call in both modelTurn.parts and toolCall
  const processedToolCallIdsRef = useRef<Set<string>>(new Set());

  // Session management: passcode-based restore
  type SessionPhase = 'choose' | 'new' | 'continue' | 'active';
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('choose');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPasscode, setSessionPasscode] = useState<string | null>(null);
  const [continuePasscodeInput, setContinuePasscodeInput] = useState('');
  const [continueError, setContinueError] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLookingUpSession, setIsLookingUpSession] = useState(false);
  const [startBannerDismissed, setStartBannerDismissed] = useState(false);
  const [passcodeCopied, setPasscodeCopied] = useState(false);

  const scopeId = sessionId ?? 'vantaige-brand-001';

  const copyPasscode = async () => {
    if (!sessionPasscode) return;
    try {
      await navigator.clipboard.writeText(sessionPasscode);
      setPasscodeCopied(true);
      setTimeout(() => setPasscodeCopied(false), 2000);
    } catch {
      // fallback for older browsers
    }
  };

  const modelTurnCountRef = useRef(0);
  const isSetupCompleteRef = useRef(false);
  const getCanSendRef = useRef<() => boolean>(() => false);
  const latestFrameRef = useRef<string | null>(null);
  getCanSendRef.current = () =>
    wsRef.current?.readyState === WebSocket.OPEN &&
    isSetupCompleteRef.current === true;
  useEffect(() => {
    isSetupCompleteRef.current = isSetupComplete;
  }, [isSetupComplete]);

  // Load context when session is active (sessionId is set)
  useEffect(() => {
    if (!sessionId || sessionPhase === 'choose' || sessionPhase === 'continue') return;
    const loadContext = async () => {
      const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(sessionId);
      if (vibeProfile?.brand_identity) setBrandIdentity(vibeProfile.brand_identity);
      setSessionLogs(sessionLogs);

      const savedAssets = await fetchBrandAssetsAction(sessionId);
      setBrandAssets(savedAssets.map(a => ({
        id: a.id,
        prompt: a.prompt,
        status: (a.status as BrandAsset['status']) || 'done',
        dataUrl: toDisplayUrl(a.image_url) ?? a.image_url,
      })));

      const savedTasks = await fetchKanbanTasksAction(sessionId);
      setKanbanTasks(savedTasks.map((t) => ({
        ...t,
        status: (t.status as KanbanTaskStatus) || 'draft',
      })));

      const savedShorts = await fetchShortVideosAction(sessionId);
      setShortVideos(savedShorts.map((v) => ({
        id: v.id,
        prompt: v.prompt,
        status: v.status as 'generating' | 'done' | 'error',
        videoUrl: v.video_url,
      })));
    };
    loadContext();
  }, [sessionId, sessionPhase]);

  // Agent instructions — camelCase per Live API WebSocket (ai.google.dev/api/live). realtimeInputConfig enables VAD/turn-taking like the official audio-orb sample.
  const setupMessage = {
    setup: {
      model: 'gemini-live-2.5-flash-native-audio',
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Aoede',
            },
          },
        },
      },
      // Minimal realtime config: VAD only (activityHandling/turnCoverage can trigger 1008 on this model)
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false },
      },
      systemInstruction: {
        parts: [
          {
            text: `You are vantAIge, a proactive Marketing Director. The user can share their screen OR turn on their camera — you receive one at a time, never both mixed. When they share screen, you see their screen (Figma, websites, decks). When they turn on camera, you see their camera (physical product, packaging, etc.).

PROACTIVE VISUAL AUDIT: Monitor the 1FPS video stream. If the screen-share (designs, mockups) or camera feed (physical products) shows anything that contradicts the saved Vibe Profile — wrong brand colors, inconsistent typography, off-brand imagery — interrupt and deliver a concise correction. Example: "I notice that blue on your Figma mockup doesn't match the electric indigo in your Vibe Profile — want me to flag the exact HEX?"

TOOLS: Call each tool ONCE per user request—never duplicate. After a tool returns, always give a brief verbal confirmation (e.g. "Done, I've added that to your Launch Pack" or "I've started generating your video—it'll be ready in a minute or two").
- finalize_marketing_strategy: Set the current strategy phase.
- generate_brand_asset: Call this whenever the user asks for a logo, banner, image, or any visual asset. Call it once per asset request. Use a rich, brand-aware prompt. When the user has screen share or camera on, you can request assets "based on what you see" — the system will use the current frame (screen or camera, whichever they have active).
- generate_short_form_video: Call when user wants a TikTok, YouTube Short, or vertical short-form video. Call it once per video request. CRITICAL: The video_prompt MUST be a structured mini-spec (80–150 words), NOT a vague vibe. Use this skeleton: (1) Video type & goal — e.g. "8s vertical ad for TikTok showcasing [product], aspirational mood"; (2) Visual formula — Camera/shot, Subject, Action, Setting, Style & mood; (3) Text/CTA — Add ONE clear CTA as text overlay at the END of the video only. Format: "Add only this exact text overlay, nothing else: '[CTA phrase]' at [last 2–3 seconds], center or bottom, clean sans serif. No typos, no emojis, no extra words, no additional text." E.g. for 8s video: "at 5–8s"; for 6s: "at 4–6s"; for 4s: "at 2–4s"; (4) Brand guardrails — "Brand vibe: modern, calm, confident. Avoid: exaggerated reactions, cartoon graphics, floating emojis, confetti, neon, meme templates."; (5) Optional structure — e.g. "0–4s: hook and action; 4–8s: payoff with CTA." Use reference_asset_ids for brand assets. Generation takes 1–3 min.
- create_kanban_task: When you say "I'm adding this to your roadmap," you MUST call this tool with structured JSON (title, platform, priority, description). For social media image posts (Instagram, TikTok), include asset_id (from prior generate_brand_asset), caption, and tags. For TikTok/YouTube Shorts video posts, include video_asset_id (from prior generate_short_form_video). IMPORTANT: The caption MUST be engaging social media post copy (1-2 sentences) — NOT the image generation prompt. Write actual post copy that would accompany the asset on the platform.
- upsert_vibe_profile: Update the persistent brand DNA whenever a significant brand decision is made.
- end_session: End the session when the user is done.

FEEDBACK LOOP: After every tool result, reference it conversationally. E.g., "I've generated that logo based on the electric indigo we discussed — it's in your Launch Pack now. How does it look?"`,
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'finalize_marketing_strategy',
              description: 'Sets the current marketing strategy phase based on conversation.',
              parameters: {
                type: 'object',
                properties: { phase: { type: 'string', description: 'The strategy phase name' } },
                required: ['phase'],
              },
            },
            {
              name: 'generate_brand_asset',
              description: 'Generates a brand visual asset (logo, banner, moodboard, etc.) using AI image generation. Call whenever the user requests visual creative output. If they have the live feed on and ask for something "based on what you see" or "from the screen/product", include that in the prompt — the system will use the current video frame to inform the image.',
              parameters: {
                type: 'object',
                properties: { image_prompt: { type: 'string', description: 'A detailed, brand-aware prompt for the image generator' } },
                required: ['image_prompt'],
              },
            },
            {
              name: 'generate_short_form_video',
              description: 'Generates a TikTok or YouTube Short (9:16 vertical video) using Veo 3.1. video_prompt MUST be a structured mini-spec (80–150 words) with: video type/goal, camera/shot style, subject, action, setting, style & mood, ONE CTA text overlay at the END only (specify exact copy, timing for last 2–3s, position, clean sans serif; no typos, no emojis, no extra text), and brand guardrails. Use reference_asset_ids for brand assets. Generation takes 1–3 min.',
              parameters: {
                type: 'object',
                properties: {
                  video_prompt: { type: 'string', description: 'Structured mini-spec (80–150 words). Include: (1) Video type & goal; (2) Camera/shot, subject, action, setting, style & mood; (3) CTA text overlay at END only: "Add only this exact text overlay, nothing else: \'[CTA phrase]\' at [last 2–3s, e.g. 5–8s for 8s video], center or bottom, clean sans serif. No typos, no emojis, no extra words."; (4) "Brand vibe: modern, calm, confident. Avoid: exaggerated reactions, cartoon graphics, emojis, confetti, neon, meme templates."; (5) Optional: time-based structure. Do NOT use vague descriptions.' },
                  reference_asset_ids: { type: 'array', items: { type: 'string' }, description: 'Optional. IDs of brand assets to use as reference for visual consistency (logos, products)' },
                  duration_seconds: { type: 'string', enum: ['4', '6', '8'], description: 'Optional. Video length in seconds. Default 6.' },
                  platform: { type: 'string', enum: ['tiktok', 'youtube_shorts'], description: 'Optional. Target platform.' },
                },
                required: ['video_prompt'],
              },
            },
            {
              name: 'create_kanban_task',
              description: 'Converts a brainstormed idea into a persistent task on the dashboard. MUST be called when adding something to the roadmap or plan. For social media image posts, include asset_id, caption (engaging post copy, NOT the image prompt), and tags.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short title for the task' },
                  description: { type: 'string', description: 'Detailed description of the task and its strategic rationale' },
                  platform: {
                    type: 'string',
                    enum: ['TikTok', 'Instagram', 'Web', 'Email', 'Multi-channel'],
                    description: 'The platform or channel for this task',
                  },
                  priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Task priority level',
                  },
                  asset_id: { type: 'string', description: 'Optional. ID of a brand asset to attach (from prior generate_brand_asset)' },
                  video_asset_id: { type: 'string', description: 'Optional. ID of a short video to attach (from prior generate_short_form_video) for TikTok/YouTube Shorts' },
                  caption: { type: 'string', description: 'Optional. Engaging social media post copy (1-2 sentences) — NOT the image generation prompt. Write actual caption that would accompany the image on Instagram/TikTok.' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Optional. Hashtags or category tags for social posts' },
                  status: {
                    type: 'string',
                    enum: ['draft', 'pending', 'in_progress', 'done'],
                    description: 'Optional. Task status. Defaults to draft.',
                  },
                },
                required: ['title', 'description', 'platform', 'priority'],
              },
            },
            {
              name: 'upsert_vibe_profile',
              description: 'Updates the persistent brand identity of the user.',
              parameters: {
                type: 'object',
                properties: { new_identity: { type: 'string', description: 'The new or updated brand identity description.' } },
                required: ['new_identity'],
              },
            },
            {
              name: 'end_session',
              description: 'Ends the current session when the conversation is naturally finished or the user requests to leave.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          ],
        },
      ],
    },
  };

  const micChunkCountRef = useRef(0);
  const micLogCountRef = useRef(0);
  const handleAudioInput = (base64Audio: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Audio }] }
    }));
    micChunkCountRef.current++;
    if (micChunkCountRef.current === 1 || micChunkCountRef.current % 100 === 0) {
      dbg('audio', `🎤 Mic → Gemini: ${micChunkCountRef.current} chunks sent`);
    }
    if (process.env.NODE_ENV === 'development' && micLogCountRef.current < 8) {
      micLogCountRef.current += 1;
      fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:handleAudioInput',message:'mic chunk sent',data:{sentSoFar:micChunkCountRef.current},timestamp:Date.now(),hypothesisId:'H1_H3'})}).catch(()=>{});
    }
  };

  const { isRecording, startRecording, stopRecording, queuePlayback, bargeIn, preparePlayback, flushPlayback } =
    useAudioPipeline(handleAudioInput, getCanSendRef);

  const handleFrame = (base64Frame: string) => {
    latestFrameRef.current = base64Frame;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Frame }] }
    }));
  };

  const { isCapturing, isScreenSharing, isCameraOn, startScreenShare, stopScreenShare, startCamera, stopCamera, stopCompositor, videoRefCamera, videoRefScreen, canvasRef } = useCompositor(handleFrame);

  const connectAPI = async (overrideScopeId?: string) => {
    const effectiveScope = overrideScopeId ?? scopeId;
    modelTurnCountRef.current = 0;
    micChunkCountRef.current = 0;
    micLogCountRef.current = 0;
    if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:connectAPI',message:'connectAPI called',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    setIsConnecting(true);

    // 1. Fetch Context
    const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(effectiveScope);
    if (vibeProfile?.brand_identity) {
      setBrandIdentity(vibeProfile.brand_identity);
    }

    // 2. Inject Memory Block into System Instruction
    const pastSummaries = sessionLogs.map((l: any, i: number) => `Session ${i + 1}: ${l.summary}`).join(' | ');
    const memoryBlock = `\n\n### MEMORY_START\nVibe Profile: ${vibeProfile?.brand_identity || 'None yet'}.\nPast Decisions: ${pastSummaries || 'First meeting.'}\nMEMORY_END ###`;

    const injectedSetup = JSON.parse(JSON.stringify(setupMessage));
    injectedSetup.setup.systemInstruction.parts[0].text += memoryBlock;

    // 3. Initialise microphone and playback context (both need user gesture to avoid suspension)
    try {
      await startRecording();
      await preparePlayback();
    } catch (e) {
      console.error("Microphone access denied or failed", e);
      setIsConnecting(false);
      return;
    }

    // Live API runs on the Python backend (backend/main.py). Set NEXT_PUBLIC_WS_URL in production.
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'ws://localhost:8000/ws'
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000/ws`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const setupStr = JSON.stringify(injectedSetup);
      if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onopen',message:'sending setup',data:{setupLength:setupStr.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      console.log('Connected to Proxy with Memory!');
      ws.send(setupStr);
      setIsConnected(true);
      setIsConnecting(false);
      isSetupCompleteRef.current = false; // Reset ref so mic is not sent until setupComplete
      setIsSetupComplete(false);
      sessionNotesRef.current = [`Started session with vibe: ${vibeProfile?.brand_identity || 'Default'}`];
      dbg('ws', '🟢 Connected to Gemini proxy — sending setup');
    };

    ws.onmessage = async (event) => {
      let rawData = event.data;
      if (rawData instanceof Blob) {
        rawData = await rawData.text();
      }

      let data: { error?: { code?: number; message?: string }; serverContent?: unknown; toolCall?: unknown; [key: string]: unknown };
      try {
        data = JSON.parse(rawData as string) as typeof data;
      } catch {
        console.warn('WebSocket message was not JSON, skipping');
        return;
      }

      // ── Gemini API errors ──────────────────────────────────────────────────
      const err = data.error;
      if (err) {
        const msg = typeof err.message === 'string' ? err.message : String(err.message ?? err);
        const code = err.code ?? '';
        dbg('error', `🔴 Gemini error ${code}: ${msg}`);
        console.error('Gemini API error:', msg, code);
        return;
      }
      if (data.serverContent) {
        const sc = data.serverContent as Record<string, unknown> & {
          interrupted?: boolean;
          modelTurn?: { parts?: unknown[] };
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        };
        const interrupted = sc.interrupted ?? (sc as Record<string, unknown>).interrupted;
        const modelTurn = sc.modelTurn ?? (sc as any).model_turn;
        const turnComplete = sc.turnComplete ?? (sc as any).turn_complete;
        if (turnComplete) modelTurnCountRef.current += 1;
        if (process.env.NODE_ENV === 'development' && turnComplete && modelTurnCountRef.current <= 3) fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:serverContent',message:'turnComplete',data:{turnIndex:modelTurnCountRef.current},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});

        if (interrupted) {
          bargeIn();
          dbg('audio', '⚡ Barge-in: cleared playback queue');
        }

        if (modelTurn?.parts) {
          const parts = modelTurn.parts;
          let audioChunks = 0;
          for (const part of parts) {
            const inlineData = part.inlineData ?? (part as any).inline_data;
            if (inlineData?.data != null) {
              const mimeType = (inlineData.mimeType ?? (inlineData as any).mime_type ?? '').toLowerCase();
              if (mimeType.startsWith('audio/pcm')) {
                const raw = inlineData.data;
                if (typeof raw === 'string') {
                  try {
                    queuePlayback(raw);
                    audioChunks++;
                  } catch (e) {
                    console.warn('[page] queuePlayback error:', e);
                    dbg('audio', `⚠️ Playback queue error: ${e}`);
                  }
                }
              }
            }
            const text = part.text;
            if (text) {
              sessionNotesRef.current.push(`Model: ${text}`);
              dbg('text', `📝 ${text.slice(0, 80)}`);
            }
            const fnCall = part.functionCall ?? (part as any).function_call;
            if (fnCall) {
              dbg('tool', `🔧 tool_call: ${fnCall.name}`);
              handleToolCall(fnCall);
            }
          }
          if (audioChunks > 0) dbg('audio', `🔊 Audio: ${audioChunks} chunk(s) queued for playback`);
        }

        if (turnComplete) {
          flushPlayback();
          dbg('ws', '✅ Turn complete');
        }
      }

      const serverContent = data.serverContent as { inputTranscription?: { text?: string }; outputTranscription?: { text?: string } } | undefined;
      if (serverContent?.inputTranscription) {
        const t = serverContent.inputTranscription?.text;
        if (t) dbg('transcript', `🎤 User: ${t}`);
        sessionNotesRef.current.push(`User (Voice): ${t}`);
      }

      if (serverContent?.outputTranscription) {
        const t = serverContent.outputTranscription?.text;
        if (t) dbg('transcript', `🤖 Model: ${t}`);
      }

      // Also handle toolCall at top level (Gemini may send it separately)
      const toolCall = data.toolCall as { functionCalls?: Array<{ name?: string; args?: unknown; id?: string }> } | undefined;
      if (toolCall?.functionCalls) {
        for (const fc of toolCall.functionCalls) {
          dbg('tool', `🔧 tool_call (top-level): ${fc.name}`);
          handleToolCall(fc);
        }
      }

      // Log any unknown / unexpected keys
      const knownKeys = ['serverContent', 'toolCall', 'setupComplete', 'error', 'usageMetadata'];
      const unknownKeys = Object.keys(data).filter(k => !knownKeys.includes(k));
      if (unknownKeys.length) dbg('raw', `❓ Unknown keys: ${unknownKeys.join(', ')} — ${JSON.stringify(data).slice(0, 120)}`);
      const hasSetupComplete = !!(data.setupComplete ?? (data as any).setup_complete);
      if (process.env.NODE_ENV === 'development' && (hasSetupComplete || Object.keys(data).some(k => k.toLowerCase().includes('setup')))) fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:onmessage',message:'setupComplete check',data:{hasSetupComplete,keys:Object.keys(data)},timestamp:Date.now(),hypothesisId:'H1_H2'})}).catch(()=>{});
      if (data.setupComplete ?? (data as any).setup_complete) {
        isSetupCompleteRef.current = true; // Sync ref immediately so worklet callback sees it before next render
        setIsSetupComplete(true);
        dbg('ws', '⚙️ Setup acknowledged by Gemini');
        if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:setupComplete',message:'setting isSetupComplete true',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      }
    };

    ws.onerror = (e) => {
      if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onerror',message:'WebSocket onerror',data:{type:typeof e},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      console.error('WebSocket Error', e);
      dbg('error', `🔴 WebSocket error — check console`);
      setIsConnecting(false);
    };

    ws.onclose = (ev) => {
      if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onclose',message:'WebSocket onclose',data:{code:ev.code,reason:ev.reason,wasClean:ev.wasClean},timestamp:Date.now(),hypothesisId:'H2_H3_H4'})}).catch(()=>{});
      dbg('ws', '🔌 Disconnected from Gemini proxy');
      setIsConnected(false);
      setIsToolPending(false);
      setIsSetupComplete(false);
      processedToolCallIdsRef.current.clear();
      stopRecording();
      stopCompositor();

      if (sessionNotesRef.current.length >= 1) {
        setIsSummarizing(true);
        summarizeSessionAction(scopeId, sessionNotesRef.current.join('\n')).then(() => {
          setIsSummarizing(false);
          fetchVantAIgeContext(scopeId).then(data => setSessionLogs(data.sessionLogs));
        }).catch(() => setIsSummarizing(false));
      }
    };

    wsRef.current = ws;
  };

  const disconnectAPI = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const sendToolResponse = (id: string, name: string, response: any) => {
    dbg('tool', `↩️ tool_response: ${name} → ${JSON.stringify(response).slice(0, 60)}`);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        toolResponse: { functionResponses: [{ id, name, response }] }
      }));
    }
    setIsToolPending(false);
  };

  const handleToolCall = async (toolCall: any) => {
    console.log('Tool Call Received:', toolCall);
    const { name, args, id } = toolCall;

    if (id && processedToolCallIdsRef.current.has(id)) {
      dbg('tool', `⏭️ Skipping duplicate tool call ${name} (id=${id})`);
      return;
    }
    if (id) processedToolCallIdsRef.current.add(id);

    // Activate the "thinking" pulse as soon as a tool call is received
    setIsToolPending(true);

    if (name === 'finalize_marketing_strategy') {
      sessionNotesRef.current.push(`Moved strategy phase to: ${args.phase}`);
      sendToolResponse(id, name, { success: true, phase: args.phase });

    } else if (name === 'generate_brand_asset') {
      const alreadyGenerating = brandAssets.some(a => a.status === 'generating');
      if (alreadyGenerating) {
        sendToolResponse(id, name, {
          success: false,
          error: 'A brand asset is already generating. Please wait for it to complete.',
        });
      } else {
      const assetId = `asset-${Date.now()}`;
      const newAsset: BrandAsset = { id: assetId, prompt: args.image_prompt, status: 'generating' };
      setBrandAssets(prev => [newAsset, ...prev]);
      sessionNotesRef.current.push(`Generating brand asset: ${args.image_prompt}`);

      try {
        let referenceFrame: string | undefined;
        if (isCapturing && latestFrameRef.current) {
          try {
            referenceFrame = await compressBase64Image(latestFrameRef.current, 512, 0.6);
          } catch {
            referenceFrame = undefined;
          }
        }
        const saved = await generateBrandAssetAction(args.image_prompt, scopeId, referenceFrame);
        const refreshed = await fetchBrandAssetsAction(scopeId);
        const newAssetData = refreshed.find(a => a.id === saved.id);
        setBrandAssets(prev =>
          prev.map(a => a.id === assetId
            ? { ...a, id: saved.id, status: 'done', dataUrl: toDisplayUrl(newAssetData?.image_url) ?? newAssetData?.image_url } : a)
        );
        sendToolResponse(id, name, { success: true, asset_id: saved.id, message: 'Brand asset generated and saved to Launch Pack.' });
        sessionNotesRef.current.push(`Generated brand asset for: ${args.image_prompt}`);
      } catch (err) {
        console.error('Brand asset generation failed:', err);
        setBrandAssets(prev =>
          prev.map(a => a.id === assetId ? { ...a, status: 'error' } : a)
        );
        sendToolResponse(id, name, { success: false, error: 'Image generation failed.' });
      }
      }

    } else if (name === 'generate_short_form_video') {
      const alreadyGenerating = shortVideos.some(s => s.status === 'generating');
      if (alreadyGenerating) {
        sendToolResponse(id, name, {
          success: false,
          error: 'A short-form video is already being generated. Please wait for it to complete.',
        });
      } else {
      const tempId = `short-${Date.now()}`;
      const newShort: { id: string; prompt: string; status: 'generating' | 'done' | 'error'; videoUrl?: string } = {
        id: tempId,
        prompt: args.video_prompt,
        status: 'generating',
      };
      setShortVideos(prev => [newShort, ...prev]);
      setShortVideoError(null);
      sessionNotesRef.current.push(`Generating short-form video: ${args.video_prompt}`);

      try {
        const { job_id } = await startShortFormVideoAction(args.video_prompt, scopeId, {
          reference_asset_ids: Array.isArray(args.reference_asset_ids) ? args.reference_asset_ids : undefined,
          duration_seconds: ['4', '6', '8'].includes(String(args.duration_seconds)) ? parseInt(String(args.duration_seconds), 10) as 4 | 6 | 8 : undefined,
          platform: args.platform === 'tiktok' || args.platform === 'youtube_shorts' ? args.platform : undefined,
        });
        const refreshed = await fetchShortVideosAction(scopeId);
        setShortVideos(refreshed.map((v) => ({
          id: v.id,
          prompt: v.prompt,
          status: (v.status as 'generating' | 'done' | 'error') ?? 'generating',
          videoUrl: v.video_url,
        })));

        // Send immediate confirmation so the AI can verbalize right away (video takes 1–3 min)
        sendToolResponse(id, name, {
          success: true,
          job_id,
          status: 'generating',
          message: 'Video generation started. It will be ready in 1–3 minutes. Check the Shorts section when it appears.',
        });

        const poll = async () => {
          const result = await checkShortFormVideoStatusAction(job_id, scopeId);
          if (result.status === 'done' && result.video_url) {
            setShortVideos(prev => prev.map(s => s.id === job_id ? { ...s, status: 'done' as const, videoUrl: result.video_url } : s));
            // Final result sent via a fresh clientContent turn (user sees video in UI); no second tool response—we already sent "started"
          } else if (result.status === 'error') {
            setShortVideos(prev => prev.map(s => s.id === job_id ? { ...s, status: 'error' as const } : s));
            // Tool response already sent as "started"; user sees error state in Shorts UI
          } else {
            setTimeout(poll, 15000);
          }
        };
        setTimeout(poll, 15000);
      } catch (err) {
        console.error('Short video start failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to start video generation.';
        setShortVideos(prev => prev.map(s => s.id === tempId ? { ...s, status: 'error' as const } : s));
        setShortVideoError(msg);
        sendToolResponse(id, name, { success: false, error: msg });
      }
      }

    } else if (name === 'create_kanban_task') {
      const { title, platform, priority, description, asset_id, video_asset_id, caption, tags, status } = args;
      const tempId = `task-${Date.now()}`;
      const optimisticTask: KanbanTask = {
        id: tempId,
        title,
        platform,
        priority: priority as KanbanTask['priority'],
        description,
        status: (status as KanbanTaskStatus) || 'draft',
      };
      setKanbanTasks(prev => [optimisticTask, ...prev]);
      sessionNotesRef.current.push(`Added to roadmap: ${title} (${platform})`);

      try {
        const saved = await createKanbanTaskAction(scopeId, title, platform, priority, description, {
          asset_id,
          video_asset_id,
          caption,
          tags: Array.isArray(tags) ? tags : undefined,
          status: status as KanbanTaskStatus | undefined,
        });
        setKanbanTasks(prev =>
          prev.map(t => t.id === tempId ? { ...t, id: saved.id || tempId, image_url: saved.image_url, video_url: saved.video_url, caption: saved.caption, tags: saved.tags } : t)
        );
        sendToolResponse(id, name, { success: true, task_id: saved.id, message: `Task "${title}" added to your roadmap.` });
      } catch {
        sendToolResponse(id, name, { success: false, error: 'Failed to save task to roadmap.' });
      }

    } else if (name === 'upsert_vibe_profile') {
      const newVibe = args.new_identity;
      setBrandIdentity(newVibe);
      sessionNotesRef.current.push(`Updated brand vibe profile to: ${newVibe}`);
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 2000);

      try {
        await upsertVibeProfileAction(scopeId, newVibe);
        sendToolResponse(id, name, { success: true, saved: newVibe });
      } catch {
        sendToolResponse(id, name, { success: false, error: 'Failed DB save' });
      }

    } else if (name === 'end_session') {
      sendToolResponse(id, name, { success: true, message: 'Session ended.' });
      sessionNotesRef.current.push('AI voluntarily ended the session.');
      setTimeout(() => disconnectAPI(), 500);
    }
  };

  const handleRegenerate = async (asset: BrandAsset) => {
    setBrandAssets(prev =>
      prev.map(a => a.id === asset.id ? { ...a, status: 'generating' as const, dataUrl: undefined } : a)
    );
    try {
      const saved = await generateBrandAssetAction(asset.prompt, scopeId);
      const refreshed = await fetchBrandAssetsAction(scopeId);
      const newAssetData = refreshed.find(a => a.id === saved.id);
      setBrandAssets(prev =>
        prev.map(a => a.id === asset.id ? { ...a, id: saved.id, status: 'done' as const, dataUrl: toDisplayUrl(newAssetData?.image_url) ?? newAssetData?.image_url } : a)
      );
    } catch (err) {
      console.error('Regeneration failed:', err);
      setBrandAssets(prev =>
        prev.map(a => a.id === asset.id ? { ...a, status: 'error' as const } : a)
      );
    }
  };

  const [launchPackTab, setLaunchPackTab] = useState<'images' | 'shorts'>('images');

  const handleAddToPlan = async (asset: BrandAsset) => {
    const tempId = `task-asset-${Date.now()}`;
    const task: KanbanTask = {
      id: tempId,
      title: `Brand Asset: ${asset.prompt.slice(0, 40)}…`,
      platform: 'Multi-channel',
      priority: 'medium',
      description: `Generated asset from prompt: ${asset.prompt}`,
      image_url: asset.dataUrl,
      caption: undefined,
      status: 'draft',
    };
    setKanbanTasks(prev => [task, ...prev]);
    try {
      const saved = await createKanbanTaskAction(
        scopeId,
        `Brand Asset: ${asset.prompt.slice(0, 40)}`,
        'Multi-channel',
        'medium',
        `Generated asset from prompt: ${asset.prompt}`,
        { image_url: asset.dataUrl, prompt_for_caption: asset.prompt, status: 'draft' }
      );
      setKanbanTasks(prev =>
        prev.map(t => (t.id === tempId ? { ...t, id: saved.id || tempId, caption: saved.caption } : t))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteShort = async (short: { id: string; prompt: string; status: string; videoUrl?: string }) => {
    const isTempId = short.id.startsWith('short-');
    if (!isTempId) {
      await deleteShortVideoAction(scopeId, short.id);
    }
    setShortVideos(prev => prev.filter(s => s.id !== short.id));
  };

  const handleAddShortToPlan = async (short: { id: string; prompt: string; status: string; videoUrl?: string }) => {
    const tempId = `task-short-${Date.now()}`;
    const task: KanbanTask = {
      id: tempId,
      title: `Short: ${short.prompt.slice(0, 40)}…`,
      platform: 'TikTok',
      priority: 'medium',
      description: `Short-form video: ${short.prompt}`,
      video_url: short.videoUrl,
      status: 'draft',
    };
    setKanbanTasks((prev) => [task, ...prev]);
    try {
      const saved = await createKanbanTaskAction(
        scopeId,
        `Short: ${short.prompt.slice(0, 40)}`,
        'TikTok',
        'medium',
        `Short-form video: ${short.prompt}`,
        { video_asset_id: short.id, status: 'draft' }
      );
      setKanbanTasks((prev) =>
        prev.map((t) => (t.id === tempId ? { ...t, id: saved.id || tempId, video_url: saved.video_url } : t))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: KanbanTaskStatus) => {
    const ok = await updateKanbanTaskStatusAction(scopeId, taskId, newStatus);
    if (ok) {
      setKanbanTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this roadmap task? This cannot be undone.')) return;
    const ok = await deleteKanbanTaskAction(scopeId, taskId);
    if (ok) {
      setKanbanTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
    }
  };

  const handleNewSession = async () => {
    setIsCreatingSession(true);
    try {
      const { session_id, passcode } = await createSessionAction();
      setSessionId(session_id);
      setSessionPasscode(passcode);
      setSessionPhase('new');
    } catch (e) {
      console.error('Failed to create session:', e);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleStartSession = () => {
    setSessionPhase('active');
    if (sessionId) connectAPI(sessionId);
  };

  const handleContinueSession = async () => {
    const code = continuePasscodeInput.trim();
    if (!code) return;
    setIsLookingUpSession(true);
    setContinueError(null);
    try {
      const result = await getSessionByPasscodeAction(code);
      if (result) {
        setSessionId(result.session_id);
        setSessionPasscode(code);
        setSessionPhase('active');
        setContinuePasscodeInput('');
        connectAPI(result.session_id);
      } else {
        setContinueError('Invalid passcode');
      }
    } catch (e) {
      setContinueError('Failed to look up session');
    } finally {
      setIsLookingUpSession(false);
    }
  };

  // Session choice / pre-connect UI
  if (sessionPhase === 'choose' || sessionPhase === 'new' || sessionPhase === 'continue') {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 selection:bg-indigo-500/30 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">vantAIge</h1>
        <p className="text-neutral-400 text-sm mb-10">Multimodal Marketing Director</p>

        {sessionPhase === 'choose' && (
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleNewSession}
              disabled={isCreatingSession}
              className="px-8 py-4 rounded-2xl bg-white text-black font-medium hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreatingSession ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              New Session
            </button>
            <button
              onClick={() => setSessionPhase('continue')}
              className="px-8 py-4 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-medium hover:bg-neutral-700 transition-all"
            >
              Continue Session
            </button>
          </div>
        )}

        {sessionPhase === 'new' && sessionPasscode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md text-center"
          >
            <p className="text-neutral-400 mb-2">Your session passcode</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <p className="text-2xl font-mono font-bold tracking-widest text-indigo-300">{sessionPasscode}</p>
              <button
                onClick={copyPasscode}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-indigo-300 transition-colors"
                title="Copy passcode"
                aria-label="Copy passcode"
              >
                {passcodeCopied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-6">Save this to restore your session later.</p>
            <button
              onClick={handleStartSession}
              className="px-8 py-3 rounded-full bg-indigo-500 text-white font-medium hover:bg-indigo-600 transition-all"
            >
              Start Session
            </button>
          </motion.div>
        )}

        {sessionPhase === 'continue' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md"
          >
            <p className="text-neutral-400 mb-3">Enter your passcode</p>
            <input
              type="text"
              value={continuePasscodeInput}
              onChange={(e) => setContinuePasscodeInput(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="e.g. A1B2C3"
              maxLength={6}
              className="w-full px-4 py-3 rounded-xl bg-neutral-950 border border-neutral-700 text-center font-mono text-lg tracking-widest focus:outline-none focus:border-indigo-500 mb-3"
              onKeyDown={(e) => e.key === 'Enter' && handleContinueSession()}
              autoFocus
            />
            {continueError && <p className="text-rose-400 text-sm mb-3">{continueError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleContinueSession}
                disabled={isLookingUpSession}
                className="flex-1 px-4 py-3 rounded-full bg-indigo-500 text-white font-medium hover:bg-indigo-600 transition-all disabled:opacity-50"
              >
                {isLookingUpSession ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Continue'}
              </button>
              <button
                onClick={() => { setSessionPhase('choose'); setContinueError(null); }}
                className="px-4 py-3 rounded-full bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
              >
                Back
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 selection:bg-indigo-500/30">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-800">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">vantAIge</h1>
          <p className="text-neutral-400 text-sm mt-1">Multimodal Marketing Director</p>
        </div>

        <div className="flex gap-4 items-center">
          {/* VantAIge is Thinking indicator */}
          <AnimatePresence>
            {isToolPending && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, scale: 0.85, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm"
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                >
                  <Cpu size={15} className="text-indigo-400" />
                </motion.div>
                <span className="font-medium">vantAIge is Thinking</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-indigo-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                    />
                  ))}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex bg-neutral-900 rounded-full p-1 border border-neutral-800 gap-1">
            <button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`p-3 rounded-full transition-all duration-300 ${isScreenSharing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            >
              <Monitor size={20} />
            </button>
            <button
              onClick={isCameraOn ? stopCamera : startCamera}
              className={`p-3 rounded-full transition-all duration-300 ${isCameraOn ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`p-3 rounded-full transition-all duration-300 ${isRecording ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-500'}`}
              title="Status of Mic (Managed by Connection)"
              disabled
            >
              {isRecording ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          </div>

          {sessionPasscode && (
            <button
              onClick={copyPasscode}
              className="rounded-full p-2.5 text-neutral-500 hover:bg-neutral-800 hover:text-indigo-300 transition-colors"
              title="Copy passcode"
              aria-label="Copy passcode"
            >
              {passcodeCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>
          )}
          <button
            onClick={() => (isConnected ? disconnectAPI() : connectAPI())}
            disabled={isConnecting}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300
              ${isConnecting ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed' :
                isConnected ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20' :
                  'bg-white text-black hover:bg-neutral-200 shadow-lg shadow-white/10'}`}
          >
            {isConnecting ? <Loader2 size={18} className="animate-spin" /> :
              isConnected ? <><Square size={16} className="fill-current" /> End</> :
                <><Play size={16} className="fill-current" /> Start conversation</>}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {!isConnected && !isConnecting && !startBannerDismissed && (
          <motion.div
            key="start-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/80 px-5 py-3 text-neutral-300 backdrop-blur-sm"
          >
          <span className="text-sm">Start conversation when you&apos;re ready</span>
          <button
            onClick={() => setStartBannerDismissed(true)}
            className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </motion.div>
        )}
      </AnimatePresence>

      <main className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
        {/* Pane 1: Live Feed + Vibe + History */}
        <section className="col-span-12 lg:col-span-4 h-full flex flex-col gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 flex-shrink-0 flex flex-col relative overflow-hidden group shadow-2xl" style={{ height: '280px' }}>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Live Feed
            </h2>
            <div className="flex-1 rounded-2xl bg-black relative overflow-hidden border border-neutral-800/50">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain bg-neutral-950"></canvas>
              {!isCapturing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 gap-3">
                  <VideoOff size={48} className="opacity-50" />
                  <p>Share screen or turn on camera</p>
                </div>
              )}
            </div>
            <video ref={videoRefCamera} className="hidden" muted playsInline />
            <video ref={videoRefScreen} className="hidden" muted playsInline />
          </div>

          <div className={`bg-neutral-900 border ${isPulsing ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)] scale-[1.02]' : 'border-neutral-800'} rounded-3xl p-5 flex-shrink-0 h-36 transition-all duration-500`}>
            <h3 className="text-sm text-neutral-400 mb-2 uppercase tracking-wider font-semibold flex items-center justify-between">
              Active Vibe Profile
              {isPulsing && <span className="text-pink-400 text-xs normal-case animate-pulse">Memory Updated</span>}
            </h3>
            <textarea
              value={brandIdentity}
              onChange={(e) => setBrandIdentity(e.target.value)}
              className="w-full h-14 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none text-sm"
              readOnly
            />
            <p className="text-xs text-neutral-500 mt-1">Saved to Persistent Memory Layer</p>
          </div>

          {/* Cross-session trend analysis */}
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 flex-shrink-0 backdrop-blur-sm">
            <h3 className="text-sm text-neutral-400 mb-3 uppercase tracking-wider font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp size={14} />
                Cross-session trends
              </span>
              <button
                onClick={async () => {
                  setIsTrendLoading(true);
                  setTrendAnalysis(null);
                  try {
                    const analysis = await getCrossSessionTrendAnalysisAction(scopeId);
                    setTrendAnalysis(analysis);
                  } catch {
                    setTrendAnalysis('Failed to load trend analysis.');
                  } finally {
                    setIsTrendLoading(false);
                  }
                }}
                disabled={isTrendLoading}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTrendLoading ? 'Analyzing…' : 'Analyze trends'}
              </button>
            </h3>
            {trendAnalysis && (
              <div className="rounded-xl bg-neutral-950/80 border border-neutral-800 p-3 max-h-40 overflow-y-auto custom-scrollbar">
                <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">{trendAnalysis}</p>
              </div>
            )}
            {!trendAnalysis && !isTrendLoading && (
              <p className="text-xs text-neutral-600 italic">Run analysis to see patterns across sessions.</p>
            )}
          </div>

          {/* Session History */}
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 flex-1 overflow-hidden flex flex-col backdrop-blur-sm">
            <h3 className="text-sm text-neutral-400 mb-4 uppercase tracking-wider font-semibold flex items-center justify-between">
              Session History
              {isSummarizing && <Loader2 size={14} className="animate-spin text-indigo-400" />}
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {isSummarizing && (
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 animate-pulse text-xs text-indigo-300">
                  Summarizing latest session...
                </div>
              )}
              {sessionLogs.map((log, i) => (
                <motion.div
                  key={log.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-neutral-800/30 border border-neutral-800 hover:bg-neutral-800/50 transition-colors"
                >
                  <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3">{log.summary}</p>
                  <span className="text-[10px] text-neutral-600 mt-2 block">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </motion.div>
              ))}
              {sessionLogs.length === 0 && !isSummarizing && (
                <p className="text-xs text-neutral-600 italic text-center py-4">No previous sessions found.</p>
              )}
            </div>
          </div>
        </section>

        {/* Pane 2: Strategy Kanban */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 h-full bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-6 backdrop-blur-sm overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-2">Strategy Flow</h2>
          <p className="text-xs text-neutral-500 mb-4">Roadmap tasks</p>

          {/* Kanban Task Cards */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
            <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-2">Roadmap Tasks</h3>
            <AnimatePresence mode="popLayout">
              {kanbanTasks.length === 0 ? (
                <motion.div key="empty-tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                  <p className="text-xs text-neutral-600 italic">vantAIge will add tasks to your roadmap here.</p>
                </motion.div>
              ) : (
                kanbanTasks.map(task => (
                  <motion.button
                    key={task.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedTask(task)}
                    className="w-full text-left p-3 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <div className="flex gap-3">
                      {task.image_url && (
                        <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                          <img src={toDisplayUrl(task.image_url) || task.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm text-neutral-200 font-medium leading-tight">{task.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColors[task.status || 'draft']}`}>
                              {statusLabels[task.status || 'draft']}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColors[task.priority] || priorityColors.medium}`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-md">{task.platform}</span>
                          {task.tags?.map((tag) => (
                            <span key={tag} className="text-[10px] bg-neutral-800/80 text-neutral-500 px-1.5 py-0.5 rounded">
                              #{tag}
                            </span>
                          ))}
                        </div>
                        {task.caption && (
                          <p className="text-xs text-neutral-500 mt-1.5 line-clamp-1">{task.caption}</p>
                        )}
                        {task.description && !task.caption && (
                          <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{task.description}</p>
                        )}
                        {task.description && task.caption && (
                          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{task.description}</p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Pane 3: Launch Pack Sidebar (Images + Shorts) */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 h-full flex flex-col">
          <div className="flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => setLaunchPackTab('images')}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                launchPackTab === 'images' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Images
            </button>
            <button
              type="button"
              onClick={() => setLaunchPackTab('shorts')}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                launchPackTab === 'shorts' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Shorts
            </button>
          </div>
          {launchPackTab === 'images' && (
            <LaunchPackSidebar assets={brandAssets} onAddToPlan={handleAddToPlan} onRegenerate={handleRegenerate} />
          )}
          {launchPackTab === 'shorts' && (
            <ShortsSidebar
              shorts={shortVideos}
              onAddToPlan={handleAddShortToPlan}
              onDelete={handleDeleteShort}
              error={shortVideoError}
              onDismissError={() => setShortVideoError(null)}
            />
          )}
        </section>
      </main>

      {/* ── Task Detail Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTask && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTask(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-4 max-h-[calc(100vh-2rem)] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[90vh] z-50 bg-neutral-900 border border-neutral-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
                <h3 className="text-lg font-semibold text-neutral-100">Task Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                <div>
                  <h4 className="text-sm font-medium text-neutral-300 mb-1">Title</h4>
                  <p className="text-neutral-100">{selectedTask.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">{selectedTask.platform}</span>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-md border ${priorityColors[selectedTask.priority] || priorityColors.medium}`}>
                    {selectedTask.priority}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-neutral-300 mb-2">Status</h4>
                  <div className="flex flex-wrap gap-2">
                    {(['draft', 'pending', 'in_progress', 'done'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStatusChange(selectedTask.id, s)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
                          (selectedTask.status || 'draft') === s
                            ? statusColors[s]
                            : 'border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                        }`}
                      >
                        {statusLabels[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedTask.description && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-1">Description</h4>
                    <p className="text-sm text-neutral-400 leading-relaxed">{selectedTask.description}</p>
                  </div>
                )}
                {selectedTask.image_url && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-2">Image</h4>
                    <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
                      <img
                        src={toDisplayUrl(selectedTask.image_url) || selectedTask.image_url}
                        alt={selectedTask.caption || selectedTask.title}
                        className="w-full aspect-video object-contain"
                      />
                    </div>
                  </div>
                )}
                {selectedTask.video_url && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-2">Video</h4>
                    <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
                      <video
                        src={selectedTask.video_url}
                        controls
                        muted
                        playsInline
                        className="w-full aspect-video object-contain"
                      />
                    </div>
                  </div>
                )}
                {selectedTask.caption && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-1">Caption</h4>
                    <p className="text-sm text-neutral-400 leading-relaxed">{selectedTask.caption}</p>
                  </div>
                )}
                {selectedTask.tags && selectedTask.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTask.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-lg">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-4 mt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(selectedTask.id)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-sm font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors"
                  >
                    <Trash2 size={16} />
                    Delete Task
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Debug Panel ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {showDebug && (
          <div className="w-96 h-72 bg-neutral-950/95 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-sm text-xs font-mono">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 shrink-0">
              <span className="text-neutral-400 font-semibold tracking-wide">Debug Console</span>
              <button
                onClick={() => setDebugLogs([])}
                className="text-neutral-600 hover:text-neutral-300 transition-colors text-[10px]"
              >
                clear
              </button>
            </div>
            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 custom-scrollbar">
              {debugLogs.length === 0 && (
                <p className="text-neutral-600 italic p-2">Waiting for events…</p>
              )}
              {debugLogs.map((log, i) => {
                const color =
                  log.type === 'error' ? 'text-rose-400' :
                    log.type === 'audio' ? 'text-sky-400' :
                      log.type === 'tool' ? 'text-amber-400' :
                        log.type === 'transcript' ? 'text-emerald-400' :
                          log.type === 'ws' ? 'text-indigo-400' :
                            'text-neutral-400';
                return (
                  <div key={i} className="flex gap-2 leading-5">
                    <span className="text-neutral-600 shrink-0">{log.ts}</span>
                    <span className={`${color} break-all`}>{log.msg}</span>
                  </div>
                );
              })}
              <div ref={debugEndRef} />
            </div>
          </div>
        )}
        {/* Toggle button */}
        <button
          onClick={() => setShowDebug(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200
            ${showDebug
              ? 'bg-neutral-800 border-neutral-600 text-neutral-200'
              : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${debugLogs.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
          Debug {debugLogs.length > 0 && `(${debugLogs.length})`}
        </button>
      </div>
    </div>
  );
}
