import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sparkles, ChevronDown, ChevronUp, Heart, ThumbsDown,
    BarChart3, Clock, CheckCircle2, TrendingUp,
} from "lucide-react";
import { api, getToken } from "@/lib/api";

interface MLStatus {
    model_available: boolean;
    model_version: number | null;
    trained_at: string | null;
    total_interactions: number;
    total_scenarios_with_feedback: number;
    training_threshold_met: boolean;
    interactions_needed: number;
    scenarios_needed: number;
    user_interactions: number;
    user_liked: number;
    user_disliked: number;
    metrics: {
        "ndcg@3"?: number;
        "ndcg@5"?: number;
        n_training_rows?: number;
        [key: string]: any;
    } | null;
}

export default function MLStatusPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<MLStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        if (!getToken()) return;
        setLoading(true);
        setError(null);
        try {
            const data = await api.getMLStatus();
            setStatus(data);
        } catch {
            setError("Could not load status");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && !status) {
            fetchStatus();
        }
    }, [isOpen]);

    // Don't render for guests
    if (!getToken()) return null;

    return (
        <div className="w-full">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                   bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-blue-900/40
                   border border-purple-500/20 hover:border-purple-400/40
                   transition-all duration-300 group"
            >
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                        <Sparkles className="w-4 h-4 text-purple-300" />
                    </div>
                    <span className="text-sm font-medium text-purple-200">Ranking System</span>
                    {status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.model_available
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            }`}>
                            {status.model_available ? "Personalised" : "Learning"}
                        </span>
                    )}
                </div>
                {isOpen
                    ? <ChevronUp className="w-4 h-4 text-purple-400" />
                    : <ChevronDown className="w-4 h-4 text-purple-400" />
                }
            </button>

            {/* Panel Content */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 p-4 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-4">
                            {loading && (
                                <div className="flex items-center justify-center py-4">
                                    <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                    <span className="ml-2 text-sm text-slate-400">Loading...</span>
                                </div>
                            )}

                            {error && (
                                <div className="text-amber-400 text-sm text-center py-2">{error}</div>
                            )}

                            {status && !loading && (
                                <>
                                    {/* Mode Banner */}
                                    <div className={`flex items-center gap-3 p-3 rounded-lg ${status.model_available
                                            ? "bg-emerald-500/10 border border-emerald-500/20"
                                            : "bg-purple-500/10 border border-purple-500/20"
                                        }`}>
                                        {status.model_available
                                            ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                            : <TrendingUp className="w-5 h-5 text-purple-400 shrink-0" />
                                        }
                                        <div>
                                            <p className="text-sm font-medium text-slate-200">
                                                {status.model_available
                                                    ? "Personalised ranking active"
                                                    : "Learning your preferences"
                                                }
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {status.model_available
                                                    ? "Rankings are adapted to your preferences"
                                                    : "Like or dislike homes to help us learn what matters to you"
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    {/* User Interaction Summary */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-center">
                                            <p className="text-xs text-slate-500">Your interactions</p>
                                            <p className="text-lg font-semibold text-slate-200 mt-1">
                                                {status.user_interactions}
                                            </p>
                                        </div>
                                        <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-center">
                                            <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                                                <Heart className="w-3 h-3 text-rose-400" /> Liked
                                            </p>
                                            <p className="text-lg font-semibold text-rose-300 mt-1">
                                                {status.user_liked}
                                            </p>
                                        </div>
                                        <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-center">
                                            <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                                                <ThumbsDown className="w-3 h-3 text-blue-400" /> Disliked
                                            </p>
                                            <p className="text-lg font-semibold text-blue-300 mt-1">
                                                {status.user_disliked}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Helpful hint when no interactions yet */}
                                    {status.user_interactions === 0 && !status.model_available && (
                                        <p className="text-xs text-slate-500 text-center italic">
                                            Use the ❤️ and 👎 buttons on your ranked homes to share your preferences
                                        </p>
                                    )}

                                    {/* Model Info (when model exists) */}
                                    {status.model_available && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Sparkles className="w-3 h-3" /> Version
                                                </p>
                                                <p className="text-sm font-semibold text-slate-200 mt-1">
                                                    v{status.model_version}
                                                </p>
                                            </div>
                                            <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Last updated
                                                </p>
                                                <p className="text-sm font-semibold text-slate-200 mt-1">
                                                    {status.trained_at
                                                        ? new Date(status.trained_at).toLocaleDateString()
                                                        : "—"
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ranking Quality (when model has metrics) */}
                                    {status.model_available && status.metrics && (
                                        <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-900/20 to-teal-900/20 border border-emerald-500/20">
                                            <p className="text-xs font-medium text-emerald-300 flex items-center gap-1 mb-2">
                                                <BarChart3 className="w-3 h-3" /> Ranking accuracy
                                            </p>
                                            <div className="flex gap-4">
                                                {status.metrics["ndcg@3"] != null && (
                                                    <div>
                                                        <span className="text-xs text-slate-400">Top 3</span>
                                                        <p className="text-lg font-bold text-emerald-300">
                                                            {(status.metrics["ndcg@3"] * 100).toFixed(1)}%
                                                        </p>
                                                    </div>
                                                )}
                                                {status.metrics["ndcg@5"] != null && (
                                                    <div>
                                                        <span className="text-xs text-slate-400">Top 5</span>
                                                        <p className="text-lg font-bold text-emerald-300">
                                                            {(status.metrics["ndcg@5"] * 100).toFixed(1)}%
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Refresh */}
                                    <button
                                        onClick={fetchStatus}
                                        className="w-full text-xs text-slate-500 hover:text-purple  -300
                               transition-colors py-1 text-center"
                                    >
                                        Refresh
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
