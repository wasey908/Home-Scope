import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { AnimatedCard } from "@/components/WizardComponents";
import {
  Plus, Home, Trash2, Pencil, Check, X, FolderOpen,
  Clock, MapPin, ArrowRight,
} from "lucide-react";
import {
  getAllScenarios, createScenario, deleteScenario, renameScenario,
  getLastScenario, migrateExistingData,
  type ScenarioData,
} from "@/lib/scenarios";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ScenarioLibraryProps {
  onOpenScenario: (scenario: ScenarioData) => void;
  onNewScenario: () => void;
  refreshTrigger?: number;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const scenarioSubtitle = (s: ScenarioData) => {
  const places = s.wizardInputs.places?.length || 0;
  const homes = s.wizardInputs.homes?.length || 0;
  const parts: string[] = [];
  if (places) parts.push(`${places} place${places !== 1 ? "s" : ""}`);
  if (homes) parts.push(`${homes} home${homes !== 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "Not started";
};

const ScenarioLibrary = ({ onOpenScenario, onNewScenario, refreshTrigger }: ScenarioLibraryProps) => {
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    migrateExistingData();
    getAllScenarios().then(setScenarios);
  }, [refreshTrigger]);

  const refresh = () => { getAllScenarios().then(setScenarios); };

  const handleCreate = async () => {
    const s = await createScenario();
    refresh();
    onOpenScenario(s);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteScenario(deleteId);
    setDeleteId(null);
    refresh();
  };

  const startRename = (s: ScenarioData) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const confirmRename = async () => {
    if (editingId && editName.trim()) {
      await renameScenario(editingId, editName.trim());
      setEditingId(null);
      refresh();
    }
  };

  // lastScenario is derived from scenarios state (already loaded)
  const lastScenario = scenarios.length > 0
    ? scenarios.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
    : null;

  return (
    <div className="flex flex-col items-center gap-8 px-6 max-w-4xl mx-auto w-full py-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center"
      >
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
          My <span className="text-primary">Scenarios</span>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Pick up where you left off, or start a fresh comparison.
        </p>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-3 justify-center"
      >
        <PrimaryButton onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" /> New scenario
        </PrimaryButton>
        {lastScenario && scenarios.length > 0 && (
          <SecondaryButton onClick={() => onOpenScenario(lastScenario)}>
            <ArrowRight className="h-4 w-4 mr-1" /> Continue last
          </SecondaryButton>
        )}
      </motion.div>

      {/* Scenario grid */}
      {scenarios.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          <AnimatePresence mode="popLayout">
            {scenarios.map((scenario, i) => (
              <motion.div
                key={scenario.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: "easeOut" }}
              >
                <div
                  className="bg-card rounded-2xl homescope-card-shadow p-5 flex flex-col gap-3 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 focus-within:ring-2 focus-within:ring-primary/30"
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingId !== scenario.id) onOpenScenario(scenario);
                  }}
                  onClick={() => {
                    if (editingId !== scenario.id) onOpenScenario(scenario);
                  }}
                >
                  {/* Icon & Name */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-homescope-green-light flex items-center justify-center shrink-0">
                      <Home className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === scenario.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                          />
                          <button
                            onClick={confirmRename}
                            className="p-1.5 text-primary hover:bg-homescope-green-light rounded-lg transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="font-semibold text-foreground text-sm truncate">
                          {scenario.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {scenarioSubtitle(scenario)}
                      </p>
                    </div>
                  </div>

                  {/* Date */}
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {formatDate(scenario.updatedAt)}
                  </p>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 pt-1 border-t border-border"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onOpenScenario(scenario)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-homescope-green-light rounded-lg transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" /> Open
                    </button>
                    <button
                      onClick={() => startRename(scenario)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    <button
                      onClick={() => setDeleteId(scenario.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col items-center gap-4 py-12"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-20 h-20 rounded-2xl bg-homescope-green-light flex items-center justify-center">
              <Home className="h-10 w-10 text-primary/60" />
            </div>
          </motion.div>
          <p className="text-muted-foreground text-center max-w-xs">
            Your comparisons will appear here. Start a new scenario to find the home that fits your life.
          </p>
          <PrimaryButton onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" /> Start your first scenario
          </PrimaryButton>
        </motion.div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the scenario and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ScenarioLibrary;
