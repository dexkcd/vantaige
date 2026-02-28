'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompositor } from '@/hooks/useCompositor';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { Mic, MicOff, Video, VideoOff, Play, Square, Loader2, Cpu, AlertCircle, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchVantAIgeContext,
  upsertVibeProfileAction,
  summarizeSessionAction,
  generateBrandAssetAction,
  createKanbanTaskAction,
  saveBrandAssetAction,
  fetchBrandAssetsAction,
  fetchKanbanTasksAction,
  getCrossSessionTrendAnalysisAction,
} from './actions/memory';
import LaunchPackSidebar, { BrandAsset } from '@/components/LaunchPackSidebar';

// Types
interface ToolCall {
  name: string;
  args: any;
  id: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  platform: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

const priorityColors: Record<string, string> = {
  high: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  low: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};

export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const [strategyPhase, setStrategyPhase] = useState<string>('Ideation');
  const [brandIdentity, setBrandIdentity] = useState<string>('Vibrant, futuristic AI brand');
  const [isPulsing, setIsPulsing] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // New state for Live Execution Bridge
  const [isToolPending, setIsToolPending] = useState(false);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);

  // Cross-session trend analysis
  const [trendAnalysis, setTrendAnalysis] = useState<string | null>(null);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  // Video feed: compositor can run (preview) but we don't send frames to Gemini until user turns this on
  const [sendVideoToAgent, setSendVideoToAgent] = useState(false);

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
  const defaultBrandId = 'vantaige-brand-001';
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

  // Load existing context on mount
  useEffect(() => {
    const loadContext = async () => {
      const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(defaultBrandId);
      if (vibeProfile?.brand_identity) setBrandIdentity(vibeProfile.brand_identity);
      setSessionLogs(sessionLogs);

      const savedAssets = await fetchBrandAssetsAction(defaultBrandId);
      setBrandAssets(savedAssets.map(a => ({
        id: a.id,
        prompt: a.prompt,
        status: (a.status as BrandAsset['status']) || 'done',
        dataUrl: a.image_url,
      })));

      const savedTasks = await fetchKanbanTasksAction(defaultBrandId);
      setKanbanTasks(savedTasks);
    };
    loadContext();
  }, []);

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
            text: `You are vantAIge, a proactive Marketing Director. You see the user's camera and screenshare simultaneously.

PROACTIVE VISUAL AUDIT: Monitor the 1FPS video stream at all times. If the user's screen-share (websites, Figma designs, decks) or webcam (physical product, packaging) shows any visual element that contradicts the saved Vibe Profile — such as wrong brand colors, inconsistent typography, or off-brand imagery — you MUST immediately interrupt and deliver a concise audio correction. Example: "I notice that blue on your Figma mockup doesn't match the electric indigo in your Vibe Profile — want me to flag the exact HEX to fix?"

TOOLS:
- finalize_marketing_strategy: Set the current strategy phase.
- generate_brand_asset: Call this whenever the user asks for a logo, banner, image, or any visual asset. Use a rich, brand-aware prompt. When the user has the live feed on (camera/screenshare), you can request assets "based on what you see" or "from the screen" — the system will use the current frame to inform the image (e.g. product shot, Figma frame, or design on screen).
- create_kanban_task: When you say "I'm adding this to your roadmap," you MUST call this tool with structured JSON (title, platform, priority, description).
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
              name: 'create_kanban_task',
              description: 'Converts a brainstormed idea into a persistent task on the dashboard. MUST be called when adding something to the roadmap or plan.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short title for the task' },
                  description: { type: 'string', description: 'Detailed description of the task and its strategic rationale' },
                  platform: {
                    type: 'string',
                    enum: ['TikTok', 'Instagram', 'Web', 'Email'],
                    description: 'The platform or channel for this task',
                  },
                  priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Task priority level',
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
    // #region agent log
    if (micLogCountRef.current < 8) {
      micLogCountRef.current += 1;
      fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:handleAudioInput',message:'mic chunk sent',data:{sentSoFar:micChunkCountRef.current},timestamp:Date.now(),hypothesisId:'H1_H3'})}).catch(()=>{});
    }
    // #endregion
  };

  const handleTextInput = (text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        realtimeInput: {
          text,
        },
      }));
      sessionNotesRef.current.push(`User said: ${text}`);
    }
  };

  const { isRecording, startRecording, stopRecording, queuePlayback, bargeIn, preparePlayback, flushPlayback } =
    useAudioPipeline(handleAudioInput, getCanSendRef);

  const handleFrame = (base64Frame: string) => {
    latestFrameRef.current = base64Frame;
    if (!sendVideoToAgent || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Frame }] }
    }));
  };

  const { isCapturing, startCompositor, stopCompositor, videoRefCamera, videoRefScreen, canvasRef } = useCompositor(handleFrame);

  const connectAPI = async () => {
    modelTurnCountRef.current = 0;
    micChunkCountRef.current = 0;
    micLogCountRef.current = 0;
    // #region agent log
    fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:connectAPI',message:'connectAPI called',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    setIsConnecting(true);

    // 1. Fetch Context
    const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(defaultBrandId);
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
      // #region agent log
      const setupStr = JSON.stringify(injectedSetup);
      fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onopen',message:'sending setup',data:{setupLength:setupStr.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
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
        // #region agent log
        if (turnComplete && modelTurnCountRef.current <= 3) {
          fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:serverContent',message:'turnComplete',data:{turnIndex:modelTurnCountRef.current},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        }
        // #endregion

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
      // #region agent log
      const hasSetupComplete = !!(data.setupComplete ?? (data as any).setup_complete);
      if (hasSetupComplete || Object.keys(data).some(k => k.toLowerCase().includes('setup'))) {
        fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:onmessage',message:'setupComplete check',data:{hasSetupComplete,keys:Object.keys(data)},timestamp:Date.now(),hypothesisId:'H1_H2'})}).catch(()=>{});
      }
      // #endregion
      if (data.setupComplete ?? (data as any).setup_complete) {
        isSetupCompleteRef.current = true; // Sync ref immediately so worklet callback sees it before next render
        setIsSetupComplete(true);
        dbg('ws', '⚙️ Setup acknowledged by Gemini');
        fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:setupComplete',message:'setting isSetupComplete true',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      }
    };

    ws.onerror = (e) => {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onerror',message:'WebSocket onerror',data:{type:typeof e},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      console.error('WebSocket Error', e);
      dbg('error', `🔴 WebSocket error — check console`);
      setIsConnecting(false);
    };

    ws.onclose = (ev) => {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'page.tsx:ws.onclose',message:'WebSocket onclose',data:{code:ev.code,reason:ev.reason,wasClean:ev.wasClean},timestamp:Date.now(),hypothesisId:'H2_H3_H4'})}).catch(()=>{});
      // #endregion
      dbg('ws', '🔌 Disconnected from Gemini proxy');
      setIsConnected(false);
      setIsToolPending(false);
      setIsSetupComplete(false);
      stopRecording();
      stopCompositor();
      setSendVideoToAgent(false);

      if (sessionNotesRef.current.length >= 1) {
        setIsSummarizing(true);
        summarizeSessionAction(defaultBrandId, sessionNotesRef.current.join('\n')).then(() => {
          setIsSummarizing(false);
          fetchVantAIgeContext(defaultBrandId).then(data => setSessionLogs(data.sessionLogs));
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

    // Activate the "thinking" pulse as soon as a tool call is received
    setIsToolPending(true);

    if (name === 'finalize_marketing_strategy') {
      setStrategyPhase(args.phase);
      sessionNotesRef.current.push(`Moved strategy phase to: ${args.phase}`);
      sendToolResponse(id, name, { success: true, phase: args.phase });

    } else if (name === 'generate_brand_asset') {
      const assetId = `asset-${Date.now()}`;
      const newAsset: BrandAsset = { id: assetId, prompt: args.image_prompt, status: 'generating' };
      setBrandAssets(prev => [newAsset, ...prev]);
      sessionNotesRef.current.push(`Generating brand asset: ${args.image_prompt}`);

      try {
        const referenceFrame = isCapturing ? (latestFrameRef.current ?? undefined) : undefined;
        const dataUrl = await generateBrandAssetAction(args.image_prompt, referenceFrame);
        const saved = await saveBrandAssetAction(defaultBrandId, args.image_prompt, dataUrl);
        setBrandAssets(prev =>
          prev.map(a => a.id === assetId ? { ...a, id: saved.id, status: 'done', dataUrl } : a)
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

    } else if (name === 'create_kanban_task') {
      const { title, platform, priority, description } = args;
      const tempId = `task-${Date.now()}`;
      const optimisticTask: KanbanTask = { id: tempId, title, platform, priority: priority as any, description };
      setKanbanTasks(prev => [optimisticTask, ...prev]);
      sessionNotesRef.current.push(`Added to roadmap: ${title} (${platform})`);

      try {
        const saved = await createKanbanTaskAction(defaultBrandId, title, platform, priority, description);
        setKanbanTasks(prev =>
          prev.map(t => t.id === tempId ? { ...t, id: saved.id || tempId } : t)
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
        await upsertVibeProfileAction(defaultBrandId, newVibe);
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
      const dataUrl = await generateBrandAssetAction(asset.prompt);
      const saved = await saveBrandAssetAction(defaultBrandId, asset.prompt, dataUrl);
      setBrandAssets(prev =>
        prev.map(a => a.id === asset.id ? { ...a, id: saved.id, status: 'done' as const, dataUrl } : a)
      );
    } catch (err) {
      console.error('Regeneration failed:', err);
      setBrandAssets(prev =>
        prev.map(a => a.id === asset.id ? { ...a, status: 'error' as const } : a)
      );
    }
  };

  const handleAddToPlan = (asset: BrandAsset) => {
    const tempId = `task-asset-${Date.now()}`;
    setKanbanTasks(prev => [{
      id: tempId,
      title: `Brand Asset: ${asset.prompt.slice(0, 40)}…`,
      platform: 'Multi-channel',
      priority: 'medium',
      description: `Generated asset from prompt: ${asset.prompt}`,
    }, ...prev]);
    createKanbanTaskAction(
      defaultBrandId,
      `Brand Asset: ${asset.prompt.slice(0, 40)}`,
      'Multi-channel',
      'medium',
      `Generated asset from prompt: ${asset.prompt}`
    ).catch(console.error);
  };

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

          <div className="flex bg-neutral-900 rounded-full p-1 border border-neutral-800">
            <button
              onClick={isCapturing ? () => { stopCompositor(); setSendVideoToAgent(false); } : startCompositor}
              className={`p-3 rounded-full transition-all duration-300 ${isCapturing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title="Toggle Compositor (Screen + Camera)"
            >
              {isCapturing ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            {isCapturing && (
              <button
                onClick={() => setSendVideoToAgent((v) => !v)}
                className={`p-3 rounded-full transition-all duration-300 ${sendVideoToAgent ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-neutral-500 hover:text-neutral-300'}`}
                title={sendVideoToAgent ? 'Pause sending video to agent' : 'Send video to agent'}
              >
                {sendVideoToAgent ? 'Video on' : 'Video paused'}
              </button>
            )}
            <button
              className={`p-3 rounded-full transition-all duration-300 ${isRecording ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-500'}`}
              title="Status of Mic (Managed by Connection)"
              disabled
            >
              {isRecording ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          </div>

          <div className="flex gap-2 mr-4">
            <input
              type="text"
              id="test-text-input"
              placeholder="Type message..."
              className="px-3 py-1 bg-neutral-800 rounded text-sm text-white border border-neutral-700 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTextInput(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
            />
          </div>

          <button
            onClick={isConnected ? disconnectAPI : connectAPI}
            disabled={isConnecting}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300
              ${isConnecting ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed' :
                isConnected ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20' :
                  'bg-white text-black hover:bg-neutral-200 shadow-lg shadow-white/10'}`}
          >
            {isConnecting ? <Loader2 size={18} className="animate-spin" /> :
              isConnected ? <><Square size={16} className="fill-current" /> End</> :
                <><Play size={16} className="fill-current" /> Connect</>}
          </button>
        </div>
      </header>

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
                  <p>Compositor paused</p>
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
                    const analysis = await getCrossSessionTrendAnalysisAction(defaultBrandId);
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
          <p className="text-xs text-neutral-500 mb-5">Phases &amp; roadmap tasks</p>

          {/* Phase stepper */}
          <div className="space-y-3 relative mb-6">
            <div className="absolute top-0 bottom-0 left-[23px] w-px bg-neutral-800 z-0"></div>
            {['Ideation', 'Drafting', 'Production', 'Review'].map((phase, idx) => {
              const isActive = strategyPhase === phase;
              return (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`relative z-10 flex items-center gap-4 p-3 rounded-2xl transition-all duration-300
                    ${isActive ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-neutral-800/50'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 border-neutral-900 shrink-0 transition-colors duration-500
                    ${isActive ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-500'}`}>
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className={`font-semibold ${isActive ? 'text-indigo-300' : 'text-neutral-400'}`}>{phase}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {isActive ? 'vantAIge is reviewing.' : 'Pending.'}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

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
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-neutral-200 font-medium leading-tight">{task.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${priorityColors[task.priority] || priorityColors.medium}`}>
                        {task.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-md">{task.platform}</span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{task.description}</p>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Pane 3: Launch Pack Sidebar */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 h-full flex flex-col">
          <LaunchPackSidebar assets={brandAssets} onAddToPlan={handleAddToPlan} onRegenerate={handleRegenerate} />
        </section>
      </main>

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
