import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { MapPin, Plus, X, Pencil, Check, Briefcase, GraduationCap, Dumbbell, Coffee, Home, School, Baby, Users, Heart, Church, Trophy, BookOpen, Laptop } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useWizardData, type PlaceEntry } from "@/lib/wizardContext";

interface PlacesStepProps {
  onNext: () => void;
  onBack: () => void;
}

const importanceLabels = ["Minimal", "Low", "Medium", "Significant", "Essential"];

const floatingIcons = [
  { Icon: Briefcase, label: "Work", delay: 0 },
  { Icon: GraduationCap, label: "Uni", delay: 0.2 },
  { Icon: Dumbbell, label: "Gym", delay: 0.4 },
  { Icon: Coffee, label: "Café", delay: 0.6 },
  { Icon: Home, label: "Home", delay: 0.8 },
  { Icon: School, label: "School", delay: 1.0 },
  { Icon: Baby, label: "Childcare", delay: 1.2 },
  { Icon: Users, label: "Family Home", delay: 1.4 },
  { Icon: Laptop, label: "Partner's Work", delay: 1.6 },
  { Icon: Church, label: "Religious Centre", delay: 1.8 },
  { Icon: Trophy, label: "Sports Club", delay: 2.0 },
  { Icon: BookOpen, label: "Library", delay: 2.2 },
  { Icon: Laptop, label: "Co-working", delay: 2.4 },
];

const PlacesStep = ({ onNext, onBack }: PlacesStepProps) => {
  const { data, setPlaces } = useWizardData();
  const [places, setLocalPlaces] = useState<PlaceEntry[]>(data.places);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [importance, setImportance] = useState(3);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [clickedIcon, setClickedIcon] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync to context when places change
  useEffect(() => {
    setPlaces(places);
  }, [places, setPlaces]);

  const addPlace = () => {
    if (!name.trim()) return;
    if (editIndex !== null) {
      setLocalPlaces(places.map((p, i) => (i === editIndex ? { name: name.trim(), address: address.trim(), importance } : p)));
      setEditIndex(null);
    } else {
      setLocalPlaces([...places, { name: name.trim(), address: address.trim(), importance }]);
    }
    setName("");
    setAddress("");
    setImportance(3);
  };

  const startEdit = (index: number) => {
    const p = places[index];
    setName(p.name);
    setAddress(p.address);
    setImportance(p.importance);
    setEditIndex(index);
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setName("");
    setAddress("");
    setImportance(3);
  };

  const removePlace = (index: number) => {
    if (editIndex === index) cancelEdit();
    setLocalPlaces(places.filter((_, i) => i !== index));
  };

  const handleIconClick = (label: string) => {
    setName(label);
    setClickedIcon(label);
    setTimeout(() => setClickedIcon(null), 400);
    setTimeout(() => {
      const addressInput = document.querySelector<HTMLInputElement>('input[placeholder*="Address or area"]');
      addressInput?.focus();
    }, 50);
  };

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 px-6 max-w-6xl mx-auto w-full">
      {/* Floating Icons Illustration — clickable */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="flex-1 max-w-sm hidden lg:flex flex-wrap items-center justify-center gap-5 py-8"
      >
        {floatingIcons.map(({ Icon, label, delay }) => (
          <motion.div
            key={label}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3 + delay, repeat: Infinity, ease: "easeInOut", delay }}
            className="flex flex-col items-center gap-2 cursor-pointer"
            onClick={() => handleIconClick(label)}
          >
            <motion.div
              className="w-14 h-14 rounded-2xl bg-homescope-green-light flex items-center justify-center homescope-card-shadow"
              whileTap={{ scale: 0.9 }}
              animate={clickedIcon === label ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <Icon className="h-6 w-6 text-primary" />
            </motion.div>
            <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight max-w-[60px]">{label}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Form Side */}
      <div className="flex-1 space-y-5 max-w-lg w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
            Where do you go <span className="text-primary">regularly?</span>
          </h2>
          <p className="text-muted-foreground mt-2">
            These places shape your everyday routine.
          </p>
        </motion.div>

        {/* Mobile icon row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex lg:hidden flex-wrap gap-2.5"
        >
          {floatingIcons.map(({ Icon, label }) => (
            <motion.button
              key={label}
              onClick={() => handleIconClick(label)}
              className="flex flex-col items-center gap-1"
              whileTap={{ scale: 0.9 }}
              animate={clickedIcon === label ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <div className="w-10 h-10 rounded-xl bg-homescope-green-light flex items-center justify-center">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground leading-tight max-w-[50px] text-center">{label}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* Add / Edit Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="bg-card rounded-2xl homescope-card-shadow p-5 space-y-3"
        >
          <div className="flex gap-2">
            <motion.input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Place name (e.g. Office, Gym)"
              className="flex-1 h-10 px-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm"
              animate={clickedIcon ? { borderColor: ["hsl(152,35%,45%)", "hsl(40,20%,88%)"] } : {}}
              transition={{ duration: 0.6 }}
            />
          </div>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlace()}
            placeholder="Address or area (e.g. 21 Uxbridge High Street, UB8 1JD)"
            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm"
          />

          {/* Importance Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Importance</span>
              <span className="text-sm font-medium text-foreground">
                {importanceLabels[importance - 1]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground px-0.5">
              {importanceLabels.map((label, i) => (
                <span key={i} className={importance === i + 1 ? "font-semibold text-foreground transition-all" : "opacity-50 transition-opacity"}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <PrimaryButton onClick={addPlace} disabled={!name.trim()} className="flex-1">
              {editIndex !== null ? (
                <><Check className="h-4 w-4 mr-1" /> Save Changes</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> Add Place</>
              )}
            </PrimaryButton>
            {editIndex !== null && (
              <SecondaryButton onClick={cancelEdit}>Cancel</SecondaryButton>
            )}
          </div>
        </motion.div>

        {/* Place Cards */}
        <div className="space-y-2.5 min-h-[60px]">
          <AnimatePresence mode="popLayout">
            {places.map((place, index) => (
              <motion.div
                key={`${place.name}-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, x: -30 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={`bg-card rounded-xl homescope-card-shadow p-4 flex items-center justify-between gap-3 ${
                  editIndex === index ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-homescope-green-light flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{place.name}</p>
                    {place.address && (
                      <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                    )}
                  </div>
                  <span className="text-xs ml-1 shrink-0 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium" title={importanceLabels[place.importance - 1]}>
                    {importanceLabels[place.importance - 1]}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(index)}
                    className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removePlace(index)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-secondary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {places.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-muted-foreground py-6 text-sm"
            >
              Add at least one place to continue
            </motion.p>
          )}
        </div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex gap-3 pt-1"
        >
          <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
          <PrimaryButton onClick={onNext} disabled={places.length === 0} className="flex-1">
            Continue →
          </PrimaryButton>
        </motion.div>
      </div>
    </div>
  );
};

export default PlacesStep;
