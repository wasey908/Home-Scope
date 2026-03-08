import { motion } from "framer-motion";
import { AnimatedCard } from "@/components/WizardComponents";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import {
  Compass, BarChart3, Brain, AlertTriangle,
  Save, RefreshCw, Heart, FolderOpen,
} from "lucide-react";
import { updateScenario } from "@/lib/scenarios";
import { useToast } from "@/hooks/use-toast";

interface HelpStepProps {
  onRestart: () => void;
  scenarioId?: string | null;
  onGoToLibrary?: () => void;
}

const sections = [
  {
    icon: Compass,
    title: "How HomeScope works",
    body: "Homes are ranked by analysing real commute patterns to the places you care about most — work, gym, school, or wherever your daily life takes you. The algorithm weighs travel time, cost, and your personal preferences to surface the homes that fit your routine best.",
  },
  {
    icon: BarChart3,
    title: "What the scores mean",
    body: "A higher fit score means your daily commutes will be shorter and more convenient overall. It doesn't mean the home is \"perfect\" — it means it fits your routine better than the alternatives you're comparing.",
  },
  {
    icon: Brain,
    title: "Learning and reliability",
    body: "When you like or dislike homes, HomeScope learns what matters to you and adjusts future rankings. Route reliability shows how many alternative paths exist — more routes mean fewer bad days when one line is disrupted.",
  },
  {
    icon: AlertTriangle,
    title: "Limitations",
    body: "Travel times are estimates based on typical conditions. Results depend on the time window you selected and may vary in practice. Preference learning needs enough feedback to be meaningful. HomeScope is a decision-support tool — not a guarantee.",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

const HelpStep = ({ onRestart, scenarioId, onGoToLibrary }: HelpStepProps) => {
  const { toast } = useToast();

  const handleSave = async () => {
    const scenario = {
      savedAt: new Date().toISOString(),
      step: "complete",
    };

    if (scenarioId) {
      await updateScenario(scenarioId, {
        lastCompletedStep: 7,
        results: scenario,
      });
    }

    toast({
      title: "Scenario saved successfully",
      description: "Saved to your account.",
    });
  };

  return (
    <div className="flex flex-col items-center gap-8 px-6 max-w-3xl mx-auto w-full pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center"
      >
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
          Help & <span className="text-primary">Understanding</span>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Everything you need to make a confident decision.
        </p>
      </motion.div>

      {/* Content sections */}
      <div className="w-full space-y-4">
        {sections.map((section, index) => (
          <motion.div
            key={section.title}
            custom={index}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <AnimatedCard className="p-5">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-homescope-green-light flex items-center justify-center shrink-0">
                  <section.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{section.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
                </div>
              </div>
            </AnimatedCard>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="flex flex-col items-center gap-4 pt-2 w-full max-w-sm"
      >
        <PrimaryButton size="lg" onClick={handleSave} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save this scenario
        </PrimaryButton>
        {onGoToLibrary && (
          <SecondaryButton size="lg" onClick={onGoToLibrary} className="w-full">
            <FolderOpen className="h-4 w-4 mr-2" />
            View all scenarios
          </SecondaryButton>
        )}
        <SecondaryButton size="lg" onClick={onRestart} className="w-full">
          <RefreshCw className="h-4 w-4 mr-2" />
          Start a new comparison
        </SecondaryButton>
      </motion.div>

      {/* Closing line */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="text-center text-muted-foreground text-sm pt-4 flex items-center gap-2"
      >
        <Heart className="h-4 w-4 text-primary/60" />
        <span className="italic">
          HomeScope helps you decide. You decide where to live.
        </span>
      </motion.p>
    </div>
  );
};

export default HelpStep;
