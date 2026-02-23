'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompositor } from '@/hooks/useCompositor';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { Mic, MicOff, Video, VideoOff, Play, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchVantAIgeContext, upsertVibeProfileAction, summarizeSessionAction } from './actions/memory';

// Types
interface ToolCall {
  name: string;
  args: any;
  id: string;
}

export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const [strategyPhase, setStrategyPhase] = useState<string>('Ideation');
  const [brandIdentity, setBrandIdentity] = useState<string>('Vibrant, futuristic AI brand');
  const [moodboards, setMoodboards] = useState<{ url: string; prompt: string }[]>([]);
  const [isPulsing, setIsPulsing] = useState(false);

  // Track events for summarization
  const sessionNotesRef = useRef<string[]>([]);
  const defaultBrandId = 'vantaige-brand-001';

  // Agent instructions injected at the beginning
  const setupMessage = {
    setup: {
      model: 'models/gemini-2.0-flash-exp', // Or what proxy requires
      systemInstruction: {
        parts: [{
          text: `You are vantAIge, a proactive Marketing Director. You audit the user's camera and screenshare visually.
You have tools to finalize_marketing_strategy and generate_moodboard.
Your goal is to converse naturally and assist the user in building out their brand identity and tasks.`
        }]
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'finalize_marketing_strategy',
              description: 'Sets the current marketing strategy phase based on conversation.',
              parameters: {
                type: 'OBJECT',
                properties: { phase: { type: 'STRING', description: 'The strategy phase name' } },
                required: ['phase']
              }
            },
            {
              name: 'generate_moodboard',
              description: 'Generates a moodboard asset image based on the prompt.',
              parameters: {
                type: 'OBJECT',
                properties: { image_prompt: { type: 'STRING', description: 'Prompt for image generator' } },
                required: ['image_prompt']
              }
            },
            {
              name: 'upsert_vibe_profile',
              description: 'Updates the persistent brand identity of the user.',
              parameters: {
                type: 'OBJECT',
                properties: { new_identity: { type: 'STRING', description: 'The new or updated brand identity description.' } },
                required: ['new_identity']
              }
            }
          ]
        }
      ]
    }
  };

  const handleAudioInput = (base64Audio: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Audio }] }
      }));
    }
  };

  const { isRecording, startRecording, stopRecording, queuePlayback, bargeIn } = useAudioPipeline(handleAudioInput);

  const handleFrame = (base64Frame: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Frame }] }
      }));
    }
  };

  const { isCapturing, startCompositor, stopCompositor, videoRefCamera, videoRefScreen, canvasRef } = useCompositor(handleFrame);

  const connectAPI = async () => {
    setIsConnecting(true);

    // 1. Fetch Context
    const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(defaultBrandId);
    if (vibeProfile?.brand_identity) {
      setBrandIdentity(vibeProfile.brand_identity);
    }

    // 2. Inject Memory Block
    const pastSummaries = sessionLogs.map((l: any, i: number) => `Session ${i + 1}: ${l.summary}`).join(' | ');
    const memoryBlock = `\n### MEMORY_START: You are continuing a relationship with this brand. Previous Vibe: ${vibeProfile?.brand_identity || 'None yet'}. Past Decisions: ${pastSummaries || 'First meeting.'}. MEMORY_END ###`;

    const injectedSetup = JSON.parse(JSON.stringify(setupMessage));
    injectedSetup.setup.systemInstruction.parts[0].text += memoryBlock;

    // The server is proxying us at wss://localhost:3000/api/proxy if we use the custom server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/proxy`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to Proxy with Memory!');
      ws.send(JSON.stringify(injectedSetup));
      setIsConnected(true);
      setIsConnecting(false);
      startRecording();
      sessionNotesRef.current = [`Started session with vibe: ${vibeProfile?.brand_identity || 'Default'}`];
    };

    ws.onmessage = (event) => {
      // Receive model responses
      const data = JSON.parse(event.data);
      if (data.serverContent) {
        const { serverContent } = data;

        // Barge-in interruption
        if (serverContent.interrupted) {
          bargeIn();
        }

        // Audio playback
        if (serverContent.modelTurn) {
          const parts = serverContent.modelTurn.parts;
          for (let part of parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
              queuePlayback(part.inlineData.data);
            }
            if (part.functionCall) {
              handleToolCall(part.functionCall);
            }
          }
        }
      }
    };

    ws.onerror = (e) => {
      console.error('WebSocket Error', e);
      setIsConnecting(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      stopRecording();
      stopCompositor();

      // Summarize the session via Server Action
      if (sessionNotesRef.current.length > 1) {
        summarizeSessionAction(defaultBrandId, sessionNotesRef.current.join('\n'));
      }
    };

    wsRef.current = ws;
  };

  const disconnectAPI = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const handleToolCall = async (toolCall: any) => {
    console.log('Tool Call Received:', toolCall);
    const { name, args, id } = toolCall;

    if (name === 'finalize_marketing_strategy') {
      setStrategyPhase(args.phase);
      sessionNotesRef.current.push(`Moved strategy phase to: ${args.phase}`);
      sendToolResponse(id, { success: true, phase: args.phase });
    } else if (name === 'generate_moodboard') {
      const mockUrl = `https://picsum.photos/seed/${Math.random()}/500/500`; // Placeholder for Nano Banana
      setMoodboards(prev => [...prev, { url: mockUrl, prompt: args.image_prompt }]);
      sessionNotesRef.current.push(`Generated moodboard for prompt: ${args.image_prompt}`);
      sendToolResponse(id, { success: true, url: mockUrl });
    } else if (name === 'upsert_vibe_profile') {
      const newVibe = args.new_identity;
      setBrandIdentity(newVibe);
      sessionNotesRef.current.push(`Updated brand vibe profile to: ${newVibe}`);

      // Trigger pulse animation
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 2000);

      try {
        await upsertVibeProfileAction(defaultBrandId, newVibe);
        sendToolResponse(id, { success: true, saved: newVibe });
      } catch (e) {
        sendToolResponse(id, { success: false, error: 'Failed DB save' });
      }
    }
  };

  const sendToolResponse = (id: string, response: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        toolResponse: { functionResponses: [{ id, name: id, response }] }
      }));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 selection:bg-indigo-500/30">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-800">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">vantAIge</h1>
          <p className="text-neutral-400 text-sm mt-1">Multimodal Marketing Director</p>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex bg-neutral-900 rounded-full p-1 border border-neutral-800">
            <button
              onClick={isCapturing ? stopCompositor : startCompositor}
              className={`p-3 rounded-full transition-all duration-300 ${isCapturing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title="Toggle Compositor (Screen + Camera)"
            >
              {isCapturing ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`p-3 rounded-full transition-all duration-300 ${isRecording ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-500'}`}
              title="Status of Mic (Managed by Connection)"
              disabled
            >
              {isRecording ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
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
        {/* Pane 1: Live Feed */}
        <section className="col-span-12 lg:col-span-5 h-full flex flex-col gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 flex-1 flex flex-col relative overflow-hidden group shadow-2xl">
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
            {/* Hidden videos for capturing */}
            <video ref={videoRefCamera} className="hidden" muted playsInline />
            <video ref={videoRefScreen} className="hidden" muted playsInline />
          </div>

          <div className={`bg-neutral-900 border ${isPulsing ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)] scale-[1.02]' : 'border-neutral-800'} rounded-3xl p-5 h-40 transition-all duration-500`}>
            <h3 className="text-sm text-neutral-400 mb-2 uppercase tracking-wider font-semibold flex items-center justify-between">
              Active Vibe Profile
              {isPulsing && <span className="text-pink-400 text-xs normal-case animate-pulse">Memory Updated</span>}
            </h3>
            <textarea
              value={brandIdentity}
              onChange={(e) => setBrandIdentity(e.target.value)}
              className="w-full h-16 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none text-sm"
              readOnly
            />
            <p className="text-xs text-neutral-500 mt-2">Saved to Persistent Memory Layer</p>
          </div>
        </section>

        {/* Pane 2: Strategy Kanban */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 h-full bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-semibold mb-6">Strategy Flow</h2>

          <div className="space-y-4 relative">
            <div className="absolute top-0 bottom-0 left-[23px] w-px bg-neutral-800 z-0"></div>

            {['Ideation', 'Drafting', 'Production', 'Review'].map((phase, idx) => {
              const isActive = strategyPhase === phase;
              return (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`relative z-10 flex items-center gap-6 p-4 rounded-2xl transition-all duration-300
                    ${isActive ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-neutral-800/50'}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-neutral-900 shrink-0 transition-colors duration-500
                    ${isActive ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-500'}`}>
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className={`font-semibold text-lg ${isActive ? 'text-indigo-300' : 'text-neutral-400'}`}>{phase}</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      {isActive ? 'vantAIge is actively reviewing this phase.' : 'Pending strategy update.'}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Pane 3: Asset Gallery */}
        <section className="col-span-12 md:col-span-6 lg:col-span-3 h-full flex flex-col gap-4">
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-6 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-xl font-semibold mb-6 flex justify-between items-center">
              Asset Gallery
              <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">{moodboards.length} items</span>
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              <AnimatePresence>
                {moodboards.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4 text-neutral-500 opacity-60">
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-neutral-600 mb-4 flex items-center justify-center">
                      +
                    </div>
                    <p>vantAIge will generate moodboards here based on your visual input.</p>
                  </div>
                ) : (
                  moodboards.map((board, i) => (
                    <motion.div
                      key={Math.random()} // Normally a real ID
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group relative rounded-2xl overflow-hidden border border-neutral-800 bg-black aspect-video cursor-pointer"
                    >
                      <img src={board.url} alt="Moodboard" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <p className="text-xs text-white max-w-full truncate">{board.prompt}</p>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
