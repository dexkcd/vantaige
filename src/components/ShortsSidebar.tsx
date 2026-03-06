'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, PlusCircle, RefreshCw, Trash2, Video } from 'lucide-react';
import { APP_NAME } from '@/lib/branding';

export interface ShortVideoAsset {
    id: string;
    prompt: string;
    status: 'generating' | 'done' | 'error';
    videoUrl?: string;
}

interface ShortsSidebarProps {
    shorts: ShortVideoAsset[];
    onAddToPlan: (short: ShortVideoAsset) => void;
    onDelete?: (short: ShortVideoAsset) => void;
    onRefresh?: () => void;
    error?: string | null;
    onDismissError?: () => void;
}

export default function ShortsSidebar({ shorts, onAddToPlan, onDelete, onRefresh, error, onDismissError }: ShortsSidebarProps) {
    const handleDownload = (short: ShortVideoAsset) => {
        if (!short.videoUrl) return;
        window.open(short.videoUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-5 sm:p-6 flex-1 overflow-hidden flex flex-col backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-1 flex justify-between items-center">
                Shorts
                <span className="flex items-center gap-2">
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-indigo-400 hover:bg-neutral-800/80 transition-colors"
                            title="Refresh shorts"
                            aria-label="Refresh shorts"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                    <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                        {shorts.filter((s) => s.status === 'done').length} ready
                    </span>
                </span>
            </h2>
            <p className="text-xs text-neutral-500 mb-5">TikTok & YouTube Shorts (9:16)</p>

            {error && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
                    <span className="text-rose-400 text-xs flex-1">{error}</span>
                    {onDismissError && (
                        <button
                            type="button"
                            onClick={onDismissError}
                            className="text-rose-400/70 hover:text-rose-300 text-xs shrink-0"
                            aria-label="Dismiss"
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                    {shorts.length === 0 ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center px-4 text-neutral-500 opacity-60 py-10"
                        >
                            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-neutral-700 mb-4 flex items-center justify-center">
                                <Video size={24} className="text-neutral-600" />
                            </div>
                            <p className="text-sm">{APP_NAME} will generate short-form videos here during your session.</p>
                        </motion.div>
                    ) : (
                        shorts.map((short) => (
                            <motion.div
                                key={short.id}
                                layout
                                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950"
                            >
                                {/* Video area */}
                                {short.status === 'generating' ? (
                                    <div className="aspect-[9/16] max-h-80 w-full mx-auto bg-neutral-900 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-neutral-700/20 to-transparent" />
                                        <div className="relative z-10 flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                                            <span className="text-xs text-indigo-300 font-medium">Generating…</span>
                                            <span className="text-[10px] text-neutral-500">1–3 min</span>
                                        </div>
                                    </div>
                                ) : short.status === 'error' ? (
                                    <div className="aspect-[9/16] max-h-80 w-full mx-auto bg-neutral-900 flex items-center justify-center">
                                        <span className="text-xs text-rose-400">Generation failed</span>
                                    </div>
                                ) : (
                                    <div className="aspect-[9/16] w-full max-h-80 mx-auto relative group overflow-hidden bg-black">
                                        <video
                                            src={typeof window !== 'undefined' && short.videoUrl?.startsWith('/')
                                                ? `${window.location.origin}${short.videoUrl}`
                                                : short.videoUrl}
                                            className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                                            controls
                                            muted
                                            playsInline
                                            loop
                                            onError={(e) => {
                                                console.error('[ShortsSidebar] Video failed to load:', short.videoUrl, e);
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                    </div>
                                )}

                                {/* Prompt label + actions */}
                                <div className="p-3">
                                    <p className="text-xs text-neutral-400 truncate mb-3" title={short.prompt}>
                                        {short.prompt}
                                    </p>
                                    <div className="flex gap-2 items-center">
                                        {short.status === 'done' && (
                                            <>
                                                <button
                                                    onClick={() => handleDownload(short)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors"
                                                >
                                                    <Download size={12} />
                                                    Download
                                                </button>
                                                <button
                                                    onClick={() => onAddToPlan(short)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs transition-colors border border-indigo-500/30"
                                                >
                                                    <PlusCircle size={12} />
                                                    Add to Plan
                                                </button>
                                            </>
                                        )}
                                        {onDelete && (short.status === 'error' || short.status === 'generating') && (
                                            <button
                                                onClick={() => onDelete(short)}
                                                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs transition-colors border border-rose-500/20"
                                                title="Remove failed or stuck video"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                        {onDelete && short.status === 'done' && (
                                            <button
                                                onClick={() => onDelete(short)}
                                                className="flex items-center justify-center py-1.5 px-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-300 text-xs transition-colors"
                                                title="Remove video"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
