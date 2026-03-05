'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Download, PlusCircle, ImageIcon, RefreshCw } from 'lucide-react';

export interface BrandAsset {
    id: string;
    prompt: string;
    status: 'pending' | 'generating' | 'done' | 'error';
    dataUrl?: string;
}

interface LaunchPackSidebarProps {
    assets: BrandAsset[];
    onAddToPlan: (asset: BrandAsset) => void;
    onRegenerate?: (asset: BrandAsset) => void;
}

export default function LaunchPackSidebar({ assets, onAddToPlan, onRegenerate }: LaunchPackSidebarProps) {
    const handleDownload = (asset: BrandAsset) => {
        if (!asset.dataUrl) return;
        window.open(asset.dataUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-6 flex-1 overflow-hidden flex flex-col backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-1 flex justify-between items-center">
                Launch Pack
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                    {assets.filter(a => a.status === 'done').length} ready
                </span>
            </h2>
            <p className="text-xs text-neutral-500 mb-5">Generated brand assets</p>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                    {assets.length === 0 ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center px-4 text-neutral-500 opacity-60 py-10"
                        >
                            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-neutral-700 mb-4 flex items-center justify-center">
                                <ImageIcon size={24} className="text-neutral-600" />
                            </div>
                            <p className="text-sm">vantAIge will generate brand assets here during your session.</p>
                        </motion.div>
                    ) : (
                        assets.map((asset) => (
                            <motion.div
                                key={asset.id}
                                layout
                                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950"
                            >
                                {/* Image area */}
                                {asset.status === 'pending' || asset.status === 'generating' ? (
                                    <div className="aspect-video w-full bg-neutral-900 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                                        {/* Shimmer skeleton */}
                                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-neutral-700/20 to-transparent" />
                                        <div className="relative z-10 flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                                            <span className="text-xs text-indigo-300 font-medium">Generating…</span>
                                        </div>
                                    </div>
                                ) : asset.status === 'error' ? (
                                    <div className="aspect-video w-full bg-neutral-900 flex items-center justify-center">
                                        <span className="text-xs text-rose-400">Generation failed</span>
                                    </div>
                                ) : (
                                    <div className="aspect-video w-full relative group overflow-hidden">
                                        <img
                                            src={asset.dataUrl}
                                            alt={asset.prompt}
                                            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    </div>
                                )}

                                {/* Prompt label + actions */}
                                <div className="p-3">
                                    <p className="text-xs text-neutral-400 truncate mb-3" title={asset.prompt}>
                                        {asset.prompt}
                                    </p>
                                    {(asset.status === 'done' || asset.status === 'error') && (
                                        <div className="flex gap-2">
                                            {asset.status === 'done' && (
                                                <>
                                                    <button
                                                        onClick={() => handleDownload(asset)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors"
                                                    >
                                                        <Download size={12} />
                                                        Download
                                                    </button>
                                                    <button
                                                        onClick={() => onAddToPlan(asset)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs transition-colors border border-indigo-500/30"
                                                    >
                                                        <PlusCircle size={12} />
                                                        Add to Plan
                                                    </button>
                                                </>
                                            )}
                                            {onRegenerate && (
                                                <button
                                                    onClick={() => onRegenerate(asset)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-xs transition-colors border border-amber-500/20"
                                                >
                                                    <RefreshCw size={12} />
                                                    Regenerate
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
