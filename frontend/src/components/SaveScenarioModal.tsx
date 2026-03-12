import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { X, Save, Pencil } from "lucide-react";

interface SaveScenarioModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    loading?: boolean;
}

const SaveScenarioModal = ({ open, onClose, onSave, loading }: SaveScenarioModalProps) => {
    const [name, setName] = useState("");

    const handleSave = () => {
        const trimmed = name.trim() || "Untitled Scenario";
        onSave(trimmed);
        setName("");
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-sm bg-card rounded-2xl homescope-card-shadow p-8 space-y-5"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="text-center space-y-1.5">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                                <Save className="h-6 w-6 text-primary" />
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-foreground">
                                Name your scenario
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Give it a name so you can find it later
                            </p>
                        </div>

                        <div className="relative">
                            <Pencil className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. London South vs East"
                                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2.5">
                            <PrimaryButton
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                {loading ? "Saving…" : "Save scenario"}
                            </PrimaryButton>
                            <SecondaryButton onClick={onClose} className="w-full">
                                Cancel
                            </SecondaryButton>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SaveScenarioModal;
