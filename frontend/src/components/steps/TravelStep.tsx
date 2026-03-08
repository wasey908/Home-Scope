import { motion } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { Train, Bus, Clock, Sunrise, Sun, Sunset, Moon, ArrowLeftRight, Footprints, BrainCircuit, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { useWizardData } from "@/lib/wizardContext";
import travelRoute from "@/assets/travel-route.png";

interface TravelStepProps {
  onNext: () => void;
  onBack: () => void;
}

const timeWindows = [
  { id: "morning", label: "Morning", icon: Sunrise, time: "6–9 AM" },
  { id: "midday", label: "Midday", icon: Sun, time: "9 AM–3 PM" },
  { id: "evening", label: "Evening", icon: Sunset, time: "3–8 PM" },
  { id: "night", label: "Night", icon: Moon, time: "8 PM–12 AM" },
];

const TravelStep = ({ onNext, onBack }: TravelStepProps) => {
  const { data, setTravel } = useWizardData();
  const [selectedTimes, setSelectedTimes] = useState<string[]>(data.travel.selectedTimes);
  const [changesPreference, setChangesPreference] = useState(data.travel.changesPreference);
  const [walkingPreference, setWalkingPreference] = useState(data.travel.walkingPreference);
  const [learnPreferences, setLearnPreferences] = useState(data.travel.learnPreferences);
  const [preferReliable, setPreferReliable] = useState(data.travel.preferReliable);

  // Sync to context
  useEffect(() => {
    setTravel({ selectedTimes, changesPreference, walkingPreference, learnPreferences, preferReliable });
  }, [selectedTimes, changesPreference, walkingPreference, learnPreferences, preferReliable, setTravel]);

  const toggleTime = (id: string) => {
    setSelectedTimes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 px-6 max-w-6xl mx-auto w-full">
      {/* Illustration side */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="flex-1 max-w-sm hidden lg:flex flex-col items-center gap-6"
      >
        {/* Train track — moves left to right */}
        <div className="relative w-full h-20 overflow-hidden">
          {/* Track line */}
          <div className="absolute bottom-4 left-0 right-0 h-0.5 bg-primary/20" />
          {/* Sleepers */}
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-between px-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-1 h-3 bg-primary/10 rounded-sm" />
            ))}
          </div>
          {/* Train moving left → right */}
          <motion.div
            animate={{ x: ["-120%", "110%"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-5 left-0"
          >
            <div className="flex items-center gap-1">
              <Train className="h-9 w-9 text-primary" />
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-7 h-5 rounded bg-primary/15 border border-primary/25" />
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bus track — moves right to left */}
        <div className="relative w-full h-16 overflow-hidden">
          {/* Road line */}
          <div className="absolute bottom-3 left-0 right-0 h-0.5 bg-accent/20" />
          <div className="absolute bottom-2 left-0 right-0 flex justify-between px-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-4 h-0.5 bg-accent/15 rounded-sm" />
            ))}
          </div>
          {/* Bus moving right → left (scaleX(-1) to face left) */}
          <motion.div
            animate={{ x: ["110%", "-120%"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-4 right-0"
            style={{ transform: "scaleX(-1)" }}
          >
            <Bus className="h-8 w-8 text-accent" />
          </motion.div>
        </div>

        <img
          src={travelRoute}
          alt="Travel route illustration"
          className="w-full h-auto rounded-2xl"
        />
      </motion.div>

      {/* Content side */}
      <div className="flex-1 space-y-5 max-w-lg w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
            How you like to <span className="text-primary">travel</span>
          </h2>
          <p className="text-muted-foreground mt-2">
            Tell us your commute style. We'll rank homes that match.
          </p>
        </motion.div>

        {/* Time window selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            When do you usually travel?
          </label>
          <div className="grid grid-cols-4 gap-2">
            {timeWindows.map((tw) => (
              <button
                key={tw.id}
                onClick={() => toggleTime(tw.id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-300 ${
                  selectedTimes.includes(tw.id)
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <tw.icon className={`h-5 w-5 transition-colors ${selectedTimes.includes(tw.id) ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-xs font-medium text-foreground">{tw.label}</span>
                <span className="text-[10px] text-muted-foreground">{tw.time}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Changes slider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4 text-accent" />
            How do you feel about changing lines?
          </label>
          <input
            type="range" min={0} max={100} value={changesPreference}
            onChange={(e) => setChangesPreference(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>I don't mind changes</span>
            <span>I hate changing lines</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 italic">
            {changesPreference < 30
              ? "We'll include routes with transfers — often faster overall."
              : changesPreference > 70
              ? "We'll prioritize direct connections, even if slightly longer."
              : "A balanced mix of direct and transfer routes."}
          </p>
        </motion.div>

        {/* Walking slider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-2"
        >
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Footprints className="h-4 w-4 text-primary" />
            How much walking is okay?
          </label>
          <input
            type="range" min={0} max={100} value={walkingPreference}
            onChange={(e) => setWalkingPreference(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>I enjoy walking</span>
            <span>Minimal walking</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 italic">
            {walkingPreference < 30
              ? "We'll consider stops further away if the route is better."
              : walkingPreference > 70
              ? "We'll stick to homes near stops — under 5 min walk."
              : "Up to 10 minutes of walking is fine."}
          </p>
        </motion.div>

        {/* Toggles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3"
        >
          <button
            onClick={() => setLearnPreferences(!learnPreferences)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-300 text-left ${
              learnPreferences ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <BrainCircuit className={`h-5 w-5 shrink-0 transition-colors ${learnPreferences ? "text-primary" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Learn my preferences over time</p>
              <p className="text-[11px] text-muted-foreground">Adapt suggestions as you explore more homes</p>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors duration-300 flex items-center px-0.5 ${learnPreferences ? "bg-primary justify-end" : "bg-secondary justify-start"}`}>
              <motion.div layout className="w-5 h-5 rounded-full bg-card shadow-sm" />
            </div>
          </button>

          <button
            onClick={() => setPreferReliable(!preferReliable)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-300 text-left ${
              preferReliable ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <ShieldCheck className={`h-5 w-5 shrink-0 transition-colors ${preferReliable ? "text-primary" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Prefer reliable routes</p>
              <p className="text-[11px] text-muted-foreground">Favor routes with fewer delays and cancellations</p>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors duration-300 flex items-center px-0.5 ${preferReliable ? "bg-primary justify-end" : "bg-secondary justify-start"}`}>
              <motion.div layout className="w-5 h-5 rounded-full bg-card shadow-sm" />
            </div>
          </button>
        </motion.div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex gap-3 pt-2"
        >
          <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
          <PrimaryButton onClick={onNext} className="flex-1">
            Calculate Results →
          </PrimaryButton>
        </motion.div>
      </div>
    </div>
  );
};

export default TravelStep;
