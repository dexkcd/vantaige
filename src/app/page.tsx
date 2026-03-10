'use client';

import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { useCompositor } from '@/hooks/useCompositor';
import { useAudioPipeline } from '@/hooks/useAudioPipeline';
import { Mic, MicOff, Video, VideoOff, Monitor, Play, Square, Loader2, Cpu, AlertCircle, TrendingUp, X, Trash2, Copy, Check, RefreshCw, Pin, PinOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchVantAIgeContext,
  upsertVibeProfileAction,
  summarizeSessionAction,
  generateBrandAssetAction,
  generateBlogPostAction,
  createKanbanTaskAction,
  updateKanbanTaskStatusAction,
  updateKanbanTaskPhaseAction,
  deleteKanbanTaskAction,
  saveBrandAssetAction,
  fetchBrandAssetsAction,
  fetchKanbanTasksAction,
  getGtmStrategyAction,
  upsertGtmStrategyAction,
  assignAssetToGtmPhaseAction,
  getCrossSessionTrendAnalysisAction,
  startShortFormVideoAction,
  checkShortFormVideoStatusAction,
  fetchShortVideosAction,
  deleteShortVideoAction,
  createSessionAction,
  getSessionByPasscodeAction,
  pinForReviewAction,
  unpinFromReviewAction,
  fetchPinnedForReviewAction,
  fetchBlogPostsAction,
  updateBlogPostPhaseAction,
} from './actions/memory';
import { compressBase64Image } from '@/lib/compressImage';
import LaunchPackSidebar, { BrandAsset } from '@/components/LaunchPackSidebar';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { DASHBOARD_MAIN_LAYOUT_CLASS } from '@/lib/layoutClasses';

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
  gtm_phase?: string;
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

function TaskCard({
  task,
  onClick,
  statusColors,
  statusLabels,
  priorityColors,
  toDisplayUrl,
}: {
  task: KanbanTask;
  onClick: () => void;
  statusColors: Record<KanbanTaskStatus, string>;
  statusLabels: Record<KanbanTaskStatus, string>;
  priorityColors: Record<string, string>;
  toDisplayUrl: (url?: string) => string | undefined;
}) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className="w-full text-left p-3 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div className="flex gap-3">
        {task.image_url ? (
          <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
            <img src={toDisplayUrl(task.image_url) || task.image_url} alt="" className="w-full h-full object-cover" />
          </div>
        ) : task.video_url ? (
          <div className="shrink-0 w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center">
            <Video size={20} className="text-indigo-400" />
          </div>
        ) : null}
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
            {task.gtm_phase && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md">{task.gtm_phase}</span>}
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
  );
}

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
  const [shortVideos, setShortVideos] = useState<Array<{ id: string; prompt: string; status: 'generating' | 'done' | 'error'; videoUrl?: string; gtm_phase?: string }>>([]);
  const [shortVideoError, setShortVideoError] = useState<string | null>(null);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [gtmStrategy, setGtmStrategy] = useState<{ id: string; name: string; description?: string; phases: string[] } | null>(null);
  const [pinnedItems, setPinnedItems] = useState<Array<{ id: string; item_type: 'asset' | 'short' | 'copy'; item_id?: string; text?: string; prompt?: string; image_url?: string; video_url?: string }>>([]);
  const [blogPreview, setBlogPreview] = useState<{ title: string; content: string; format: 'markdown' | 'html'; prompt?: string } | null>(null);
  const [blogPosts, setBlogPosts] = useState<Array<{ id: string; title: string; content: string; format: 'markdown' | 'html'; created_at: string; gtm_phase?: string }>>([]);

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
    isSetupCompleteRef.current === true &&
    !isToolPending;
  useEffect(() => {
    isSetupCompleteRef.current = isSetupComplete;
  }, [isSetupComplete]);

  // Load context when session is active (sessionId is set)
  // Each fetch runs independently so a failure in one doesn't block shorts/assets/tasks
  useEffect(() => {
    if (!sessionId || sessionPhase === 'choose' || sessionPhase === 'continue' || sessionPhase === 'new') return;
    const loadContext = async () => {
      try {
        const { vibeProfile, sessionLogs } = await fetchVantAIgeContext(sessionId);
        if (vibeProfile?.brand_identity) setBrandIdentity(vibeProfile.brand_identity);
        setSessionLogs(sessionLogs);
      } catch (e) {
        console.error('Failed to load vibe/session logs:', e);
      }
      try {
        const savedAssets = await fetchBrandAssetsAction(sessionId);
        setBrandAssets(savedAssets.map(a => ({
          id: a.id,
          prompt: a.prompt,
          status: (a.status as BrandAsset['status']) || 'done',
          dataUrl: toDisplayUrl(a.image_url) ?? a.image_url,
          gtm_phase: a.gtm_phase,
        })));
      } catch (e) {
        console.error('Failed to load brand assets:', e);
      }
      try {
        const savedTasks = await fetchKanbanTasksAction(sessionId);
        setKanbanTasks(savedTasks.map((t) => ({
          ...t,
          status: (t.status as KanbanTaskStatus) || 'draft',
        })));
      } catch (e) {
        console.error('Failed to load kanban tasks:', e);
      }
      try {
        const savedShorts = await fetchShortVideosAction(sessionId);
        const mapped = savedShorts.map((v) => ({
          id: v.id,
          prompt: v.prompt,
          status: v.status as 'generating' | 'done' | 'error',
          videoUrl: v.video_url,
          gtm_phase: v.gtm_phase,
        }));
        setShortVideos(mapped);
        if (mapped.length > 0) setLaunchPackTab('shorts');
      } catch (e) {
        console.error('Failed to load short videos:', e);
      }
      try {
        const pinned = await fetchPinnedForReviewAction(sessionId);
        setPinnedItems(pinned);
      } catch (e) {
        console.error('Failed to load pinned items:', e);
      }
      try {
        const strategy = await getGtmStrategyAction(sessionId);
        setGtmStrategy(strategy ? { id: strategy.id, name: strategy.name, description: strategy.description, phases: strategy.phases } : null);
      } catch (e) {
        console.error('Failed to load GTM strategy:', e);
      }
      try {
        const posts = await fetchBlogPostsAction(sessionId, 50);
        setBlogPosts(posts);
      } catch (e) {
        console.error('Failed to load blog posts:', e);
      }
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
            text: `You are ${APP_NAME}, a proactive Marketing Director. You can create brand images, short-form videos (TikTok/Shorts), and long-form blog posts (Markdown or HTML) that are saved and previewable in the Launch Pack—ready to paste into Medium, Ghost, Substack, or any CMS. When you greet the user or describe what you can do, mention that you can also draft blog posts from your conversation. The user can share their screen OR turn on their camera — you receive one at a time, never both mixed. When they share screen, you see their screen (Figma, websites, decks). When they turn on camera, you see their camera (physical product, packaging, etc.).

PROACTIVE VISUAL AUDIT: Monitor the 1FPS video stream. If the screen-share (designs, mockups) or camera feed (physical products) shows anything that contradicts the saved Vibe Profile — wrong brand colors, inconsistent typography, off-brand imagery — interrupt and deliver a concise correction. Example: "I notice that blue on your Figma mockup doesn't match the electric indigo in your Vibe Profile — want me to flag the exact HEX?"

AFFECTIVE INTELLIGENCE: Infer the user's tone and emotional state from their voice (pace, energy, word choice) and adapt your responses accordingly. If they sound frustrated or rushed → be concise, solution-focused, and avoid tangents. If they sound excited or energized → match their energy and enthusiasm. If they sound uncertain → offer reassurance and clear options. If they sound distracted or multitasking → keep responses brief and actionable. Never mention that you're "adapting to their tone" — do it naturally.

COHESIVE CONVERSATION: When ANY tool is running (upsert_vibe_profile, generate_brand_asset, generate_short_form_video, generate_blog_post, create_kanban_task, pin_copy, etc.), the user may speak—e.g. refining their vibe ("actually more minimalist"), changing an asset ("make it blue"), or adding context. Treat ALL speech during tool execution as a follow-up or clarification to the CURRENT request. Do NOT start a new conversation thread. Wait for the tool result, then incorporate both the tool output and the user's additional input into a single cohesive response. One turn, one flow.

CONSENT FOR TOOLS: You MUST NOT call ANY tool (generate_brand_asset, generate_short_form_video, generate_blog_post, create_kanban_task, pin_copy, upsert_vibe_profile, assign_asset_to_gtm_phase, create_or_update_gtm_strategy, etc.) until the user gives explicit permission. Before calling a tool, briefly describe what you will do and ask for confirmation—e.g. "I'll generate a logo with [description]. Should I go ahead?" or "I can add this as a roadmap task titled '[title]'. Want me to add it?" Only call the tool after they say yes, okay, go ahead, sure, do it, etc. Never silently or automatically call tools without first confirming.

GENERATION ANNOUNCEMENTS: When you call generate_brand_asset, generate_short_form_video, or generate_blog_post, you MUST ALWAYS: (1) Announce START—e.g. "Starting image generation now...", "Generating your video now—this will take about a minute or two.", or "Writing your blog post now...". (2) Announce END—after the tool returns, say something like "Done! Your [image/video/post] is ready in the Launch Pack." Never silently generate; the user must hear when generation begins and when it completes.

TOOLS: Before calling any tool, summarize the action and ask for confirmation. Call each tool ONCE per user request—never duplicate. After a tool returns, always give a brief verbal confirmation (e.g. "Done, I've added that to your Launch Pack" or "I've started generating your video—it'll be ready in a minute or two").
- create_or_update_gtm_strategy: Creates or updates the persisted GTM (Go-To-Market) strategy for this session. Call when the user wants to define or change their GTM strategy. Provide name, phases (ordered array, e.g. ["Awareness", "Consideration", "Launch", "Retention"]), and optional description. This is saved to the dashboard so tasks and assets can be assigned to phases.
- generate_brand_asset: Call ONLY after user gives explicit permission. When they ask for a logo, banner, image, or visual asset, first describe it and ask "Should I generate it?" or "Want me to go ahead?" Only call after yes. Use a rich, brand-aware prompt. When they have screen share or camera on, you can request assets "based on what you see." ALWAYS announce when you start ("Starting image generation now...") and when it completes ("Done! Your image is in the Launch Pack.").
- generate_short_form_video: Call ONLY after user gives explicit permission. When they want a TikTok or YouTube Short, first summarize the video and ask "Should I generate it?" Only call after yes. CRITICAL: The video_prompt MUST be a structured mini-spec (80–150 words), NOT a vague vibe. Use this skeleton: (1) Video type & goal; (2) Visual formula — Camera/shot, Subject, Action, Setting, Style & mood; (3) Text/CTA — Add ONE clear CTA as text overlay at the END only. Format: "Add only this exact text overlay, nothing else: '[CTA phrase]' at [last 2–3 seconds], center or bottom, clean sans serif. No typos, no emojis, no extra words."; (4) Brand guardrails; (5) Optional structure. Use reference_asset_ids for brand assets. Generation takes 1–3 min. ALWAYS announce when you start ("Generating your video now—this will take about a minute or two.") and when it completes ("Done! Your video is ready in the Shorts section.").
- create_kanban_task: When you say "I'm adding this to your roadmap," you MUST call this tool with structured JSON (title, platform, priority, description). Before calling, briefly summarize the task and ask for confirmation (e.g. "Should I add this as a roadmap task titled '[title]' for [platform]?"). Only call after they confirm. Optionally include gtm_phase (string) to assign the task to a GTM strategy phase (e.g. "Launch", "Awareness"). Before calling, CHECK if you've already added a task with the same or very similar title in this session—do NOT create duplicates. For social media image posts (Instagram, TikTok), include asset_id (from prior generate_brand_asset), caption, and tags. For TikTok/YouTube Shorts video posts, include video_asset_id (from prior generate_short_form_video). IMPORTANT: The caption MUST be engaging social media post copy (1-2 sentences) — NOT the image generation prompt. Write actual post copy that would accompany the asset on the platform.
- assign_asset_to_gtm_phase: Assigns an existing brand asset or short video to a GTM strategy phase. Use when the user says to put an asset or short into a specific phase (e.g. "Put that logo in the Launch phase"). Provide item_type ("brand_asset" or "short_video"), item_id (the asset or video ID), and phase (string matching a phase name from the GTM strategy).
- upsert_vibe_profile: Update the persistent brand DNA whenever a significant brand decision is made. Before calling, summarize the change and confirm the user wants it saved to their Vibe Profile.
- pin_copy: When suggesting social media copy, taglines, or captions for the user to review, call this to pin the copy to the Launch Pack Review tab—but only after you ask whether they want it pinned and they confirm.
- generate_blog_post: When the user wants a blog post or long-form article for Medium, Ghost, Substack, or their site, call this with topic (and optional notes, format, length, angle, audience). The post is saved in Firestore and pinned in the Launch Pack with a preview. First describe what you'll write and ask for confirmation; then call the tool. Announce when you start and when the post is ready.
- end_session: End the session when the user is done.

FEEDBACK LOOP: After every tool result, reference it conversationally. E.g., "I've generated that logo based on the electric indigo we discussed — it's in your Launch Pack now. How does it look?"`,
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'create_or_update_gtm_strategy',
              description: 'Creates or updates the persisted GTM (Go-To-Market) strategy for this session. Use when the user wants to define or change their GTM strategy (e.g. phases like Awareness, Consideration, Launch, Retention). Saved so tasks and assets can be assigned to phases.',
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name of the GTM strategy (e.g. "Q2 Launch")' },
                  phases: { type: 'array', items: { type: 'string' }, description: 'Ordered list of phase names (e.g. ["Awareness", "Consideration", "Launch", "Retention"])' },
                  description: { type: 'string', description: 'Optional short description of the strategy' },
                },
                required: ['name', 'phases'],
              },
            },
            {
              name: 'generate_brand_asset',
              description: 'Generates a brand visual asset (logo, banner, moodboard, etc.) using AI image generation. REQUIRES explicit user consent—do NOT call until the user confirms (yes, go ahead, etc.) after you describe what you will create. If they have the live feed on and ask for something "based on what you see", include that in the prompt. You MUST announce when generation starts and when it completes.',
              parameters: {
                type: 'object',
                properties: { image_prompt: { type: 'string', description: 'A detailed, brand-aware prompt for the image generator' } },
                required: ['image_prompt'],
              },
            },
            {
              name: 'generate_short_form_video',
              description: 'Generates a TikTok or YouTube Short (9:16 vertical video) using Veo 3.1. REQUIRES explicit user consent—do NOT call until the user confirms after you summarize the video. video_prompt MUST be a structured mini-spec (80–150 words) with: video type/goal, camera/shot style, subject, action, setting, style & mood, ONE CTA text overlay at the END only, and brand guardrails. Use reference_asset_ids for brand assets. Generation takes 1–3 min. You MUST announce when generation starts and when it completes.',
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
                  gtm_phase: { type: 'string', description: 'Optional. GTM strategy phase to assign this task to (e.g. "Launch", "Awareness")' },
                },
                required: ['title', 'description', 'platform', 'priority'],
              },
            },
            {
              name: 'assign_asset_to_gtm_phase',
              description: 'Assigns an existing brand asset or short video to a GTM strategy phase. Use when the user wants to put an asset or short into a specific phase.',
              parameters: {
                type: 'object',
                properties: {
                  item_type: { type: 'string', enum: ['brand_asset', 'short_video'], description: 'Type of item to assign' },
                  item_id: { type: 'string', description: 'ID of the brand asset or short video' },
                  phase: { type: 'string', description: 'Name of the GTM phase (e.g. "Launch", "Awareness")' },
                },
                required: ['item_type', 'item_id', 'phase'],
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
              name: 'pin_copy',
              description: 'Pins suggested copy (tagline, caption, CTA) to the Launch Pack Review tab so the user can review it. Call when you suggest social media copy, headlines, or taglines that the user might want to save for later.',
              parameters: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'The copy text to pin for review (e.g. caption, tagline, CTA)' },
                  prompt: { type: 'string', description: 'Optional. Context or label for this copy (e.g. "Instagram caption for product launch")' },
                },
                required: ['text'],
              },
            },
            {
              name: 'generate_blog_post',
              description:
                'Generates a long-form blog post (Markdown or HTML) based on the current conversation, vibe profile, and past sessions. Use this when the user asks for a blog post, article, or long-form content they can paste into Medium, Ghost, Substack, or their CMS.',
              parameters: {
                type: 'object',
                properties: {
                  topic: {
                    type: 'string',
                    description:
                      'Short description or working title for the blog post (e.g. "How we turn live sessions into launch packs").',
                  },
                  notes: {
                    type: 'string',
                    description:
                      'Optional notes or bullet points capturing what the user just said that should be emphasized in the article.',
                  },
                  format: {
                    type: 'string',
                    enum: ['markdown', 'html'],
                    description:
                      'Output format for the blog post body. Default is markdown if not provided.',
                  },
                  length: {
                    type: 'string',
                    enum: ['short', 'medium', 'long'],
                    description:
                      'Approximate length: short (~600-800 words), medium (~1200-1500), long (~2000+). Defaults to medium.',
                  },
                  angle: {
                    type: 'string',
                    description:
                      'Optional requested angle, e.g. "founder story", "deep technical breakdown", "case study", or "product launch announcement".',
                  },
                  audience: {
                    type: 'string',
                    description:
                      'Intended audience description, e.g. "B2B SaaS founders", "growth marketers", or "ML engineers".',
                  },
                },
                required: ['topic'],
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

  const {
    isCapturing,
    isScreenSharing,
    isCameraOn,
    cameraFacingMode,
    startScreenShare,
    stopScreenShare,
    startCamera,
    stopCamera,
    toggleCameraFacingMode,
    stopCompositor,
    videoRefCamera,
    videoRefScreen,
    canvasRef,
  } = useCompositor(handleFrame);

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
    setSessionLogs(sessionLogs);

    // 1b. Load Launch Pack data (shorts, assets, tasks) — ensures they show on continue session
    // Use allSettled so one failure doesn't block the others
    const [assetsResult, tasksResult, shortsResult, pinnedResult, gtmStrategyResult] = await Promise.allSettled([
      fetchBrandAssetsAction(effectiveScope),
      fetchKanbanTasksAction(effectiveScope),
      fetchShortVideosAction(effectiveScope),
      fetchPinnedForReviewAction(effectiveScope),
      getGtmStrategyAction(effectiveScope),
    ]);
    if (assetsResult.status === 'fulfilled') {
      setBrandAssets(assetsResult.value.map(a => ({
        id: a.id,
        prompt: a.prompt,
        status: (a.status as BrandAsset['status']) || 'done',
        dataUrl: toDisplayUrl(a.image_url) ?? a.image_url,
        gtm_phase: a.gtm_phase,
      })));
    }
    if (tasksResult.status === 'fulfilled') {
      setKanbanTasks(tasksResult.value.map((t) => ({
        ...t,
        status: (t.status as KanbanTaskStatus) || 'draft',
      })));
    }
    if (shortsResult.status === 'fulfilled') {
      const shorts = shortsResult.value.map((v) => ({
        id: v.id,
        prompt: v.prompt,
        status: v.status as 'generating' | 'done' | 'error',
        videoUrl: v.video_url,
        gtm_phase: v.gtm_phase,
      }));
      setShortVideos(shorts);
      // Auto-switch to Shorts tab when continuing a session with existing shorts
      if (shorts.length > 0) setLaunchPackTab('shorts');
    }
    if (pinnedResult.status === 'fulfilled') {
      setPinnedItems(pinnedResult.value);
    }
    if (gtmStrategyResult.status === 'fulfilled' && gtmStrategyResult.value) {
      const s = gtmStrategyResult.value;
      setGtmStrategy({ id: s.id, name: s.name, description: s.description, phases: s.phases });
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

    if (name === 'create_or_update_gtm_strategy') {
      const { name: strategyName, phases, description: strategyDescription } = args;
      const phasesArr = Array.isArray(phases) ? (phases as string[]) : [];
      if (!strategyName || phasesArr.length === 0) {
        sendToolResponse(id, name, {
          success: false,
          error: 'name and phases (non-empty array) are required.',
        });
        setIsToolPending(false);
        return;
      }
      try {
        const result = await upsertGtmStrategyAction(scopeId, strategyName, phasesArr, strategyDescription);
        if (result) {
          setGtmStrategy({
            id: result.id,
            name: result.name,
            description: result.description,
            phases: result.phases,
          });
          // Reload tasks/assets/shorts so anything that had a removed phase becomes Unassigned in the UI.
          try {
            const [assets, tasks, shorts] = await Promise.all([
              fetchBrandAssetsAction(scopeId),
              fetchKanbanTasksAction(scopeId),
              fetchShortVideosAction(scopeId),
            ]);
            setBrandAssets(
              assets.map((a) => ({
                id: a.id,
                prompt: a.prompt,
                status: (a.status as BrandAsset['status']) || 'done',
                dataUrl: toDisplayUrl(a.image_url) ?? a.image_url,
                gtm_phase: a.gtm_phase,
              })),
            );
            setKanbanTasks(
              tasks.map((t) => ({
                ...t,
                status: (t.status as KanbanTaskStatus) || 'draft',
              })),
            );
            setShortVideos(
              shorts.map((v) => ({
                id: v.id,
                prompt: v.prompt,
                status: v.status as 'generating' | 'done' | 'error',
                videoUrl: v.video_url,
                gtm_phase: v.gtm_phase,
              })),
            );
          } catch (reloadErr) {
            console.error('Failed to reload GTM-scoped data after strategy update:', reloadErr);
          }
          sessionNotesRef.current.push(
            `GTM strategy updated: ${result.name} (${result.phases.join(', ')})`,
          );
          sendToolResponse(id, name, {
            success: true,
            name: result.name,
            phases: result.phases,
            message: `GTM strategy "${result.name}" saved with ${result.phases.length} phases.`,
          });
        } else {
          sendToolResponse(id, name, {
            success: false,
            error: 'Failed to save GTM strategy.',
          });
        }
      } catch (err) {
        console.error('create_or_update_gtm_strategy failed:', err);
        sendToolResponse(id, name, {
          success: false,
          error: 'Failed to save GTM strategy.',
        });
      }

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
        let mapped = refreshed.map((v) => ({
          id: v.id,
          prompt: v.prompt,
          status: (v.status as 'generating' | 'done' | 'error') ?? 'generating',
          videoUrl: v.video_url,
        }));
        // Firestore eventual consistency: newly created short may not appear in fetch yet — ensure it's in the list
        if (!mapped.some((s) => s.id === job_id)) {
          mapped = [{ id: job_id, prompt: args.video_prompt, status: 'generating' as const, videoUrl: undefined }, ...mapped];
        }
        setShortVideos(mapped);

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
            setShortVideos(prev => {
              const existing = prev.find(s => s.id === job_id);
              if (existing) {
                return prev.map(s => s.id === job_id ? { ...s, status: 'done' as const, videoUrl: result.video_url } : s);
              }
              // Short was lost (e.g. eventual consistency); add it now
              return [{ id: job_id, prompt: args.video_prompt, status: 'done' as const, videoUrl: result.video_url }, ...prev];
            });
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
      const { title, platform, priority, description, asset_id, video_asset_id, caption, tags, status, gtm_phase } = args;
      const titleNorm = String(title || '').trim().toLowerCase();
      const isDuplicate = titleNorm && kanbanTasks.some(
        t => String(t.title || '').trim().toLowerCase() === titleNorm
      );
      if (isDuplicate) {
        sendToolResponse(id, name, { success: false, error: `A task with the title "${title}" already exists on your roadmap. Not creating a duplicate.` });
        setIsToolPending(false);
        return;
      }
      const tempId = `task-${Date.now()}`;
      const optimisticTask: KanbanTask = {
        id: tempId,
        title,
        platform,
        priority: priority as KanbanTask['priority'],
        description,
        status: (status as KanbanTaskStatus) || 'draft',
        gtm_phase: gtm_phase as string | undefined,
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
          gtm_phase: gtm_phase as string | undefined,
        });
        setKanbanTasks(prev =>
          prev.map(t => t.id === tempId ? { ...t, id: saved.id || tempId, image_url: saved.image_url, video_url: saved.video_url, caption: saved.caption, tags: saved.tags, gtm_phase: saved.gtm_phase } : t)
        );
        sendToolResponse(id, name, { success: true, task_id: saved.id, message: `Task "${title}" added to your roadmap.` });
      } catch {
        sendToolResponse(id, name, { success: false, error: 'Failed to save task to roadmap.' });
      }

    } else if (name === 'assign_asset_to_gtm_phase') {
      const { item_type, item_id, phase } = args;
      if (!item_type || !item_id || !phase) {
        sendToolResponse(id, name, { success: false, error: 'item_type, item_id, and phase are required.' });
        setIsToolPending(false);
        return;
      }
      if (item_type !== 'brand_asset' && item_type !== 'short_video') {
        sendToolResponse(id, name, { success: false, error: 'item_type must be brand_asset or short_video.' });
        setIsToolPending(false);
        return;
      }
      try {
        const ok = await assignAssetToGtmPhaseAction(scopeId, item_type, item_id, phase);
        if (ok) {
          if (item_type === 'brand_asset') {
            const refreshed = await fetchBrandAssetsAction(scopeId);
            setBrandAssets(refreshed.map((a) => ({ id: a.id, prompt: a.prompt, status: (a.status as BrandAsset['status']) || 'done', dataUrl: toDisplayUrl(a.image_url) ?? a.image_url, gtm_phase: a.gtm_phase })));

            // Treat phase assignment for an image as "Add to Plan + set phase" (avoid duplicates).
            const assigned = refreshed.find((a) => a.id === item_id);
            if (assigned) {
              const alreadyHasTask = kanbanTasks.some((t) => {
                const sameImage =
                  !!t.image_url &&
                  (t.image_url === assigned.image_url ||
                    toDisplayUrl(t.image_url) === toDisplayUrl(assigned.image_url));
                return sameImage && (t.gtm_phase ?? '') === phase;
              });
              if (!alreadyHasTask) {
                try {
                  const saved = await createKanbanTaskAction(
                    scopeId,
                    `Brand Asset: ${String(assigned.prompt || '').slice(0, 40)}`,
                    'Multi-channel',
                    'medium',
                    `Generated asset from prompt: ${assigned.prompt}`,
                    { image_url: assigned.image_url, prompt_for_caption: assigned.prompt, status: 'draft', gtm_phase: phase }
                  );
                  const optimistic: KanbanTask = {
                    id: saved.id,
                    title: saved.title,
                    platform: saved.platform || 'Multi-channel',
                    priority: (saved.priority as KanbanTask['priority']) || 'medium',
                    description: saved.description || '',
                    image_url: saved.image_url,
                    video_url: saved.video_url,
                    caption: saved.caption,
                    tags: saved.tags,
                    status: 'draft',
                    gtm_phase: saved.gtm_phase,
                  };
                  setKanbanTasks((prev) => [optimistic, ...prev]);
                } catch (e) {
                  console.error('Failed to auto-create task from assigned asset:', e);
                }
              }
            }
          } else {
            const refreshed = await fetchShortVideosAction(scopeId);
            setShortVideos(refreshed.map((v) => ({ id: v.id, prompt: v.prompt, status: v.status as 'generating' | 'done' | 'error', videoUrl: v.video_url, gtm_phase: v.gtm_phase })));
          }
          sessionNotesRef.current.push(`Assigned ${item_type} ${item_id} to phase "${phase}".`);
          sendToolResponse(id, name, { success: true, message: `Assigned to phase "${phase}".` });
        } else {
          sendToolResponse(id, name, { success: false, error: 'Failed to assign asset to phase.' });
        }
      } catch (err) {
        console.error('assign_asset_to_gtm_phase failed:', err);
        sendToolResponse(id, name, { success: false, error: 'Failed to assign asset to phase.' });
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

    } else if (name === 'pin_copy') {
      const copyText = args.text ?? args.copy_text ?? '';
      const context = args.prompt ?? args.context ?? '';
      if (!copyText.trim()) {
        sendToolResponse(id, name, { success: false, error: 'No copy text provided.' });
        return;
      }
      try {
        const result = await pinForReviewAction(scopeId, {
          item_type: 'copy',
          text: copyText.trim(),
          prompt: context.trim() || undefined,
        });
        if (result?.id) {
          setPinnedItems(prev => [{ id: result.id, item_type: 'copy', text: copyText.trim(), prompt: context.trim() || undefined }, ...prev]);
          setLaunchPackTab('review');
          sendToolResponse(id, name, { success: true, message: 'Copy pinned to Launch Pack Review.' });
        } else {
          sendToolResponse(id, name, { success: false, error: 'Failed to pin copy.' });
        }
      } catch {
        sendToolResponse(id, name, { success: false, error: 'Failed to pin copy.' });
      }

    } else if (name === 'generate_blog_post') {
      const rawTopic = args.topic;
      const topic = typeof rawTopic === 'string' ? rawTopic.trim() : '';
      if (!topic) {
        sendToolResponse(id, name, {
          success: false,
          error: 'A non-empty "topic" is required to generate a blog post.',
        });
        return;
      }

      try {
        const result = await generateBlogPostAction(scopeId, {
          topic,
          notes: typeof args.notes === 'string' ? args.notes : undefined,
          format: args.format === 'html' ? 'html' : 'markdown',
          length:
            args.length === 'short' || args.length === 'medium' || args.length === 'long'
              ? args.length
              : 'medium',
          angle: typeof args.angle === 'string' ? args.angle : undefined,
          audience: typeof args.audience === 'string' ? args.audience : undefined,
        });

        // Optimistically pin the generated blog post into the Launch Pack Review tab
        try {
          const pinPrompt = `Blog post (${result.format}) – ${result.title}`;
          const pin = await pinForReviewAction(scopeId, {
            item_type: 'copy',
            item_id: result.id || undefined,
            text: result.content,
            prompt: pinPrompt,
          });
          if (pin?.id) {
            setPinnedItems(prev => [
              {
                id: pin.id,
                item_type: 'copy',
                item_id: result.id || undefined,
                text: result.content,
                prompt: pinPrompt,
              },
              ...prev,
            ]);
            setLaunchPackTab('review');
          }
        } catch (e) {
          console.error('Failed to pin generated blog post:', e);
        }

        // Keep local list of blog posts in sync for GTM views
        setBlogPosts(prev => [
          {
            id: result.id,
            title: result.title,
            content: result.content,
            format: result.format,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);

        sessionNotesRef.current.push(
          `Generated blog post via tool: ${result.title} [format=${result.format}]`
        );
        sendToolResponse(id, name, {
          success: true,
          id: result.id,
          title: result.title,
          content: result.content,
          format: result.format,
        });
      } catch (err) {
        console.error('Blog post generation failed:', err);
        sendToolResponse(id, name, {
          success: false,
          error: 'Failed to generate blog post.',
        });
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

  const [launchPackTab, setLaunchPackTab] = useState<'images' | 'shorts' | 'review'>('images');

  // Refetch shorts when switching to Shorts tab (ensures shorts load on continue session)
  useEffect(() => {
    if (launchPackTab !== 'shorts' || !sessionId || sessionPhase !== 'active') return;
    const loadShorts = async () => {
      const savedShorts = await fetchShortVideosAction(sessionId);
      setShortVideos(savedShorts.map((v) => ({
        id: v.id,
        prompt: v.prompt,
        status: v.status as 'generating' | 'done' | 'error',
        videoUrl: v.video_url,
        gtm_phase: v.gtm_phase,
      })));
    };
    loadShorts();
  }, [launchPackTab, sessionId, sessionPhase]);

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

  const handleRefreshShorts = async () => {
    if (!scopeId) return;
    try {
      const refreshed = await fetchShortVideosAction(scopeId);
      setShortVideos(refreshed.map((v) => ({
        id: v.id,
        prompt: v.prompt,
        status: (v.status as 'generating' | 'done' | 'error') ?? 'generating',
        videoUrl: v.video_url,
        gtm_phase: v.gtm_phase,
      })));
    } catch (err) {
      console.error('Failed to refresh shorts:', err);
    }
  };

  const handlePinAsset = async (asset: BrandAsset) => {
    if (!scopeId || asset.status !== 'done' || !asset.dataUrl) return;
    try {
      const result = await pinForReviewAction(scopeId, {
        item_type: 'asset',
        item_id: asset.id,
        prompt: asset.prompt,
        image_url: asset.dataUrl,
      });
      if (result?.id) {
        setPinnedItems(prev => [{ id: result.id, item_type: 'asset', item_id: asset.id, prompt: asset.prompt, image_url: asset.dataUrl }, ...prev]);
        setLaunchPackTab('review');
      }
    } catch (e) {
      console.error('Failed to pin asset:', e);
    }
  };

  const handlePinShort = async (short: { id: string; prompt: string; status: string; videoUrl?: string }) => {
    if (!scopeId || short.status !== 'done' || !short.videoUrl) return;
    try {
      const result = await pinForReviewAction(scopeId, {
        item_type: 'short',
        item_id: short.id,
        prompt: short.prompt,
        video_url: short.videoUrl,
      });
      if (result?.id) {
        setPinnedItems(prev => [{ id: result.id, item_type: 'short', item_id: short.id, prompt: short.prompt, video_url: short.videoUrl }, ...prev]);
        setLaunchPackTab('review');
      }
    } catch (e) {
      console.error('Failed to pin short:', e);
    }
  };

  const handleUnpin = async (pinId: string) => {
    if (!scopeId) return;
    try {
      await unpinFromReviewAction(scopeId, pinId);
      setPinnedItems(prev => prev.filter(p => p.id !== pinId));
    } catch (e) {
      console.error('Failed to unpin:', e);
    }
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

  const handleTaskPhaseChange = async (taskId: string, gtmPhase: string | null) => {
    const ok = await updateKanbanTaskPhaseAction(scopeId, taskId, gtmPhase);
    if (ok) {
      setKanbanTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, gtm_phase: gtmPhase ?? undefined } : t))
      );
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, gtm_phase: gtmPhase ?? undefined } : null));
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

    const parseBlogMetaFromPrompt = (prompt?: string | null): { title: string; format: 'markdown' | 'html' } => {
    if (!prompt) {
      return { title: 'Blog post', format: 'markdown' };
    }
    const match = /^Blog post \((markdown|html)\)\s*–\s*(.+)$/i.exec(prompt);
    if (match) {
      const fmt = match[1].toLowerCase() === 'html' ? 'html' : 'markdown';
      const title = match[2].trim() || 'Blog post';
      return { title, format: fmt };
    }
      return { title: prompt, format: 'markdown' };
  };

  // Session choice / pre-connect UI
  if (sessionPhase === 'choose' || sessionPhase === 'new' || sessionPhase === 'continue') {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 font-sans p-4 sm:p-6 selection:bg-indigo-500/30 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">{APP_NAME}</h1>
        <p className="text-neutral-400 text-sm mb-8 sm:mb-10 text-center">{APP_TAGLINE}</p>

        {sessionPhase === 'choose' && (
          <div className="flex w-full max-w-md flex-col sm:flex-row gap-4">
            <button
              onClick={handleNewSession}
              disabled={isCreatingSession}
              className="w-full px-8 py-4 rounded-2xl bg-white text-black font-medium hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreatingSession ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              New Session
            </button>
            <button
              onClick={() => setSessionPhase('continue')}
              className="w-full px-8 py-4 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-medium hover:bg-neutral-700 transition-all"
            >
              Continue Session
            </button>
          </div>
        )}

        {sessionPhase === 'new' && sessionPasscode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center"
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
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 max-w-md w-full"
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
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 font-sans p-4 sm:p-6 selection:bg-indigo-500/30">
      <header className="mb-6 sm:mb-8 pb-4 border-b border-neutral-800 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">{APP_NAME}</h1>
          <p className="text-neutral-400 text-sm mt-1">{APP_TAGLINE}</p>
        </div>

        <div className="flex flex-wrap gap-3 sm:gap-4 items-center xl:justify-end">
          {/* VantAIge is Thinking indicator */}
          <AnimatePresence>
            {isToolPending && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, scale: 0.85, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs sm:text-sm"
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                >
                  <Cpu size={15} className="text-indigo-400" />
                </motion.div>
                <span className="font-medium">Processing</span>
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
              className={`p-2.5 sm:p-3 rounded-full transition-all duration-300 ${isScreenSharing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            >
              <Monitor size={20} />
            </button>
            <button
              onClick={isCameraOn ? stopCamera : () => startCamera()}
              className={`p-2.5 sm:p-3 rounded-full transition-all duration-300 ${isCameraOn ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              onClick={toggleCameraFacingMode}
              disabled={!isCameraOn}
              className={`p-2.5 sm:p-3 rounded-full transition-all duration-300 ${isCameraOn ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' : 'text-neutral-600 cursor-not-allowed'}`}
              title={
                isCameraOn
                  ? `Switch to ${cameraFacingMode === 'user' ? 'back' : 'front'} camera`
                  : 'Turn on camera to switch front/back lens'
              }
              aria-label={isCameraOn ? 'Switch camera lens' : 'Camera lens switch unavailable'}
            >
              <RefreshCw size={20} />
            </button>
            <button
              className={`p-2.5 sm:p-3 rounded-full transition-all duration-300 ${isRecording ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-500'}`}
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
            className={`flex w-full sm:w-auto justify-center items-center gap-2 px-5 sm:px-6 py-3 rounded-full font-medium transition-all duration-300
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
            className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 sm:px-5 py-3 text-neutral-300 backdrop-blur-sm"
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

      <main className={DASHBOARD_MAIN_LAYOUT_CLASS}>
        {/* Pane 1: Live Feed + Vibe + History */}
        <section className="col-span-12 lg:col-span-4 lg:h-full flex flex-col gap-4 min-h-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 flex-shrink-0 flex flex-col relative overflow-hidden group shadow-2xl h-[240px] sm:h-[280px] lg:h-[300px]">
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

          <div className={`bg-neutral-900 border ${isPulsing ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)] scale-[1.02]' : 'border-neutral-800'} rounded-3xl p-5 flex-shrink-0 min-h-36 transition-all duration-500`}>
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
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 lg:flex-1 min-h-[260px] lg:overflow-hidden flex flex-col backdrop-blur-sm">
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

        {/* Pane 2: Strategy Kanban / GTM Strategy Flow */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 lg:h-full bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 sm:p-6 backdrop-blur-sm lg:overflow-hidden flex flex-col min-h-[320px]">
          <h2 className="text-xl font-semibold mb-1">Strategy Flow</h2>
          {gtmStrategy ? (
            <>
              <p className="text-sm text-neutral-400 mb-1">{gtmStrategy.name}</p>
              {gtmStrategy.description && <p className="text-xs text-neutral-500 mb-4 line-clamp-2">{gtmStrategy.description}</p>}
              {!gtmStrategy.description && <p className="text-xs text-neutral-500 mb-4">Tasks and assets by phase</p>}
            </>
          ) : (
            <p className="text-xs text-neutral-500 mb-4">Roadmap tasks. Define a GTM strategy with phases (e.g. Awareness, Launch) to assign tasks and assets to phases.</p>
          )}

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
            {gtmStrategy && gtmStrategy.phases.length > 0 ? (
              <>
                {/* Unassigned section */}
                {(kanbanTasks.some(t => !t.gtm_phase) || brandAssets.some(a => !a.gtm_phase) || shortVideos.some(s => !s.gtm_phase) || blogPosts.some(b => !b.gtm_phase)) && (
                  <div className="space-y-2">
                    <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-semibold sticky top-0 bg-neutral-900/95 py-1">Unassigned</h3>
                    {kanbanTasks.filter(t => !t.gtm_phase).map(task => (
                      <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} statusColors={statusColors} statusLabels={statusLabels} priorityColors={priorityColors} toDisplayUrl={toDisplayUrl} />
                    ))}
                    {brandAssets.filter(a => !a.gtm_phase && a.status === 'done').map(asset => (
                      <div key={`asset-${asset.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50">
                        {asset.dataUrl && <img src={asset.dataUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                        <span className="text-xs text-neutral-400 truncate flex-1">Image: {asset.prompt.slice(0, 40)}…</span>
                        <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Asset</span>
                      </div>
                    ))}
                    {shortVideos.filter(s => !s.gtm_phase && s.status === 'done').map(short => (
                      <div key={`short-${short.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50">
                        <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0"><Video size={18} className="text-indigo-400" /></div>
                        <span className="text-xs text-neutral-400 truncate flex-1">{short.prompt.slice(0, 40)}…</span>
                        <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Short</span>
                      </div>
                    ))}
                    {blogPosts.filter(b => !b.gtm_phase).map(post => (
                      <div key={`blog-${post.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50">
                        <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                          <span className="text-[10px] text-indigo-300 font-medium">Blog</span>
                        </div>
                        <span className="text-xs text-neutral-400 truncate flex-1">{post.title}</span>
                        <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Blog</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Per-phase sections */}
                {gtmStrategy.phases.map(phase => {
                  const phaseTasks = kanbanTasks.filter(t => t.gtm_phase === phase);
                  const phaseAssets = brandAssets.filter(a => a.gtm_phase === phase && a.status === 'done');
                  const phaseShorts = shortVideos.filter(s => s.gtm_phase === phase && s.status === 'done');
                  const phaseBlogs = blogPosts.filter(b => b.gtm_phase === phase);
                  if (phaseTasks.length === 0 && phaseAssets.length === 0 && phaseShorts.length === 0 && phaseBlogs.length === 0) return null;
                  return (
                    <div key={phase} className="space-y-2">
                      <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-semibold sticky top-0 bg-neutral-900/95 py-1">{phase}</h3>
                      {phaseTasks.map(task => (
                        <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} statusColors={statusColors} statusLabels={statusLabels} priorityColors={priorityColors} toDisplayUrl={toDisplayUrl} />
                      ))}
                      {phaseAssets.map(asset => (
                        <button
                          key={`asset-${asset.id}`}
                          type="button"
                          onClick={() => {
                            if (!asset.dataUrl) return;
                            window.open(asset.dataUrl, '_blank', 'noopener,noreferrer');
                          }}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600/60 transition-colors text-left"
                          title="Open full image"
                        >
                          {asset.dataUrl && <img src={asset.dataUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                          <span className="text-xs text-neutral-400 truncate flex-1">Image: {asset.prompt.slice(0, 40)}…</span>
                          <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Asset</span>
                        </button>
                      ))}
                      {phaseShorts.map(short => (
                        <button
                          key={`short-${short.id}`}
                          type="button"
                          onClick={() => {
                            if (!short.videoUrl) return;
                            window.open(short.videoUrl, '_blank', 'noopener,noreferrer');
                          }}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600/60 transition-colors text-left"
                          title="Open video"
                        >
                          <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0"><Video size={18} className="text-indigo-400" /></div>
                          <span className="text-xs text-neutral-400 truncate flex-1">{short.prompt.slice(0, 40)}…</span>
                          <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Short</span>
                        </button>
                      ))}
                      {phaseBlogs.map(post => (
                        <button
                          key={`blog-${post.id}`}
                          type="button"
                          onClick={() => {
                            setBlogPreview({
                              title: post.title,
                              format: post.format,
                              content: post.content,
                            });
                          }}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600/60 transition-colors text-left"
                          title="Open blog preview"
                        >
                          <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-indigo-300 font-medium">Blog</span>
                          </div>
                          <span className="text-xs text-neutral-400 truncate flex-1">{post.title}</span>
                          <span className="text-[10px] bg-neutral-700 text-neutral-500 px-2 py-0.5 rounded">Blog</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </>
            ) : (
              <AnimatePresence mode="popLayout">
                <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-2">Roadmap Tasks</h3>
                {kanbanTasks.length === 0 ? (
                  <motion.div key="empty-tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                    <p className="text-xs text-neutral-600 italic">{APP_NAME} will add tasks to your roadmap here. Ask to define a GTM strategy with phases (e.g. Awareness, Consideration, Launch) to organize tasks and assets by phase.</p>
                  </motion.div>
                ) : (
                  kanbanTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} statusColors={statusColors} statusLabels={statusLabels} priorityColors={priorityColors} toDisplayUrl={toDisplayUrl} />
                  ))
                )}
              </AnimatePresence>
            )}
          </div>
        </section>

        {/* Pane 3: Launch Pack Sidebar (Images + Shorts) */}
        <section className="col-span-12 md:col-span-6 lg:col-span-4 lg:h-full flex flex-col min-h-[320px]">
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
            <button
              type="button"
              onClick={() => setLaunchPackTab('review')}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                launchPackTab === 'review' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Review {pinnedItems.length > 0 && `(${pinnedItems.length})`}
            </button>
          </div>
          {launchPackTab === 'images' && (
            <LaunchPackSidebar
              assets={brandAssets}
              onAddToPlan={handleAddToPlan}
              onRegenerate={handleRegenerate}
              onPin={handlePinAsset}
              pinnedIds={pinnedItems.filter(p => p.item_type === 'asset').map(p => p.item_id!).filter(Boolean)}
              gtmPhases={gtmStrategy?.phases ?? []}
              onAssignToPhase={gtmStrategy?.phases?.length ? async (assetId, phase) => {
                const ok = await assignAssetToGtmPhaseAction(scopeId, 'brand_asset', assetId, phase);
                if (ok) {
                  const refreshed = await fetchBrandAssetsAction(scopeId);
                  setBrandAssets(refreshed.map(a => ({ id: a.id, prompt: a.prompt, status: (a.status as BrandAsset['status']) || 'done', dataUrl: toDisplayUrl(a.image_url) ?? a.image_url, gtm_phase: a.gtm_phase })));

                  // Treat phase assignment for an image as "Add to Plan + set phase" (avoid duplicates).
                  const assigned = refreshed.find((a) => a.id === assetId);
                  if (assigned) {
                    const alreadyHasTask = kanbanTasks.some((t) => {
                      const sameImage =
                        !!t.image_url &&
                        (t.image_url === assigned.image_url ||
                          toDisplayUrl(t.image_url) === toDisplayUrl(assigned.image_url));
                      return sameImage && (t.gtm_phase ?? '') === phase;
                    });
                    if (!alreadyHasTask) {
                      try {
                        const saved = await createKanbanTaskAction(
                          scopeId,
                          `Brand Asset: ${String(assigned.prompt || '').slice(0, 40)}`,
                          'Multi-channel',
                          'medium',
                          `Generated asset from prompt: ${assigned.prompt}`,
                          { image_url: assigned.image_url, prompt_for_caption: assigned.prompt, status: 'draft', gtm_phase: phase }
                        );
                        const optimistic: KanbanTask = {
                          id: saved.id,
                          title: saved.title,
                          platform: saved.platform || 'Multi-channel',
                          priority: (saved.priority as KanbanTask['priority']) || 'medium',
                          description: saved.description || '',
                          image_url: saved.image_url,
                          video_url: saved.video_url,
                          caption: saved.caption,
                          tags: saved.tags,
                          status: 'draft',
                          gtm_phase: saved.gtm_phase,
                        };
                        setKanbanTasks((prev) => [optimistic, ...prev]);
                      } catch (e) {
                        console.error('Failed to auto-create task from assigned asset:', e);
                      }
                    }
                  }
                }
              } : undefined}
            />
          )}
          {launchPackTab === 'shorts' && (
            <ShortsSidebar
              shorts={shortVideos}
              onAddToPlan={handleAddShortToPlan}
              onDelete={handleDeleteShort}
              onRefresh={handleRefreshShorts}
              error={shortVideoError}
              onDismissError={() => setShortVideoError(null)}
              onPin={handlePinShort}
              pinnedIds={pinnedItems.filter(p => p.item_type === 'short').map(p => p.item_id!).filter(Boolean)}
              gtmPhases={gtmStrategy?.phases ?? []}
              onAssignToPhase={gtmStrategy?.phases?.length ? async (shortId, phase) => {
                const ok = await assignAssetToGtmPhaseAction(scopeId, 'short_video', shortId, phase);
                if (ok) {
                  const refreshed = await fetchShortVideosAction(scopeId);
                  setShortVideos(refreshed.map(v => ({ id: v.id, prompt: v.prompt, status: (v.status as 'generating' | 'done' | 'error') ?? 'generating', videoUrl: v.video_url, gtm_phase: v.gtm_phase })));
                }
              } : undefined}
            />
          )}
          {launchPackTab === 'review' && (
            <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 sm:p-6 flex-1 overflow-hidden flex flex-col backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-1">Pinned for Review</h2>
              <p className="text-xs text-neutral-500 mb-5">Assets and copy you&apos;ve pinned for later review</p>
              <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                {pinnedItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4 text-neutral-500 opacity-60 py-10">
                    <p className="text-sm">Pin assets or copy from Images/Shorts, or ask {APP_NAME} to suggest copy to pin.</p>
                  </div>
                ) : (
                  pinnedItems.map((pin) => {
                    const isBlogCopy = pin.item_type === 'copy' && (pin.prompt?.toLowerCase().startsWith('blog post (') ?? false);
                    return (
                      <div key={pin.id} className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 p-3">
                        {pin.item_type === 'asset' && pin.image_url && (
                          <>
                            <img src={toDisplayUrl(pin.image_url) ?? pin.image_url} alt={pin.prompt ?? ''} className="aspect-video w-full object-cover rounded-xl mb-2" />
                            <p className="text-xs text-neutral-400 truncate mb-2" title={pin.prompt}>{pin.prompt}</p>
                          </>
                        )}
                        {pin.item_type === 'short' && pin.video_url && (
                          <>
                            <video src={pin.video_url} className="aspect-[9/16] max-h-48 w-full object-contain rounded-xl mb-2 bg-black" muted playsInline loop />
                            <p className="text-xs text-neutral-400 truncate mb-2" title={pin.prompt}>{pin.prompt}</p>
                          </>
                        )}
                        {pin.item_type === 'copy' && pin.prompt && (
                          <p className="text-xs text-neutral-500 mb-2" title={pin.prompt}>{pin.prompt}</p>
                        )}
                        {pin.item_type === 'copy' && (
                          <p className="text-sm text-neutral-200 whitespace-pre-wrap">{pin.text}</p>
                        )}
                        {isBlogCopy && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const meta = parseBlogMetaFromPrompt(pin.prompt);
                                setBlogPreview({
                                  title: meta.title,
                                  format: meta.format,
                                  content: pin.text || '',
                                  prompt: pin.prompt,
                                });
                              }}
                              className="text-xs px-2.5 py-1 rounded-full border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                            >
                              Open blog preview
                            </button>
                            {gtmStrategy && gtmStrategy.phases.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-neutral-500">Phase:</span>
                                <select
                                  className="text-[10px] bg-neutral-900 border border-neutral-700 rounded-full px-2 py-0.5 text-neutral-300"
                                  value={(() => {
                                    const post = blogPosts.find(b => b.id === pin.item_id);
                                    return post?.gtm_phase ?? '';
                                  })()}
                                  onChange={async (e) => {
                                    const phase = e.target.value || null;
                                    if (!pin.item_id) return;
                                    const ok = await updateBlogPostPhaseAction(scopeId, pin.item_id, phase);
                                    if (ok) {
                                      setBlogPosts(prev =>
                                        prev.map(b =>
                                          b.id === pin.item_id ? { ...b, gtm_phase: phase ?? undefined } : b,
                                        ),
                                      );
                                    }
                                  }}
                                >
                                  <option value="">Unassigned</option>
                                  {gtmStrategy.phases.map(p => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                        {pin.item_type !== 'copy' && pin.prompt && <p className="text-xs text-neutral-500 mb-2">{pin.prompt}</p>}
                        <button
                          type="button"
                          onClick={() => handleUnpin(pin.id)}
                          className="mt-2 text-xs text-neutral-400 hover:text-rose-400 transition-colors"
                        >
                          Unpin
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
                {gtmStrategy && gtmStrategy.phases.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-300 mb-2">GTM Phase</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleTaskPhaseChange(selectedTask.id, null)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
                          !selectedTask.gtm_phase
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            : 'border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                        }`}
                      >
                        Unassigned
                      </button>
                      {gtmStrategy.phases.map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          onClick={() => handleTaskPhaseChange(selectedTask.id, phase)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
                            selectedTask.gtm_phase === phase
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                              : 'border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400'
                          }`}
                        >
                          {phase}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* ── Blog Preview Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {blogPreview && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBlogPreview(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-4 max-h-[calc(100vh-2rem)] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[90vh] z-50 bg-neutral-900 border border-neutral-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-neutral-100 truncate">{blogPreview.title}</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    {blogPreview.format === 'html' ? 'HTML blog post' : 'Markdown blog post'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(blogPreview.content);
                      } catch {
                        // ignore clipboard errors
                      }
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-colors"
                  >
                    Copy post
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlogPreview(null)}
                    className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                    aria-label="Close blog preview"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar">
                {(() => {
                  if (blogPreview.format === 'html') {
                    return (
                      <div
                        className="prose prose-invert max-w-none text-sm prose-headings:text-neutral-50 prose-p:text-neutral-100 prose-strong:text-neutral-50 prose-a:text-indigo-300"
                        dangerouslySetInnerHTML={{ __html: blogPreview.content }}
                      />
                    );
                  }
                  const html = marked.parse(blogPreview.content || '');
                  return (
                    <div
                      className="prose prose-invert max-w-none text-sm prose-headings:text-neutral-50 prose-p:text-neutral-100 prose-strong:text-neutral-50 prose-a:text-indigo-300"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Debug Panel ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-1rem)]">
        {showDebug && (
          <div className="w-[calc(100vw-1.5rem)] sm:w-96 h-64 sm:h-72 bg-neutral-950/95 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-sm text-xs font-mono">
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
