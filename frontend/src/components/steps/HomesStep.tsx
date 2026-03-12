import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { Home, Plus, X, ClipboardPaste, DollarSign, Pencil, Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useWizardData, type HomeEntry } from "@/lib/wizardContext";
import homesGrid from "@/assets/homes-grid.png";

interface HomesStepProps {
  onNext: () => void;
  onBack: () => void;
}

const HOUSE_COLORS = [
  "text-primary", "text-accent", "text-primary/70", "text-accent/70",
  "text-primary/50", "text-accent/50", "text-primary/80", "text-accent/80",
];

// Improved bulk paste parser: supports multiple formats
function parseBulkLine(line: string): HomeEntry {
  const trimmed = line.trim();

  // Try: Address (800) or Address (£800)
  const parenMatch = trimmed.match(/^(.+?)\s*\(£?\s*(\d[\d,]*)\s*\)\s*$/);
  if (parenMatch) return { address: parenMatch[1].trim(), rent: parenMatch[2].replace(/,/g, "") };

  // Try: Address - £800 or Address - 800
  const dashMatch = trimmed.match(/^(.+?)\s*[-–—]\s*£?\s*(\d[\d,]*)\s*$/);
  if (dashMatch) return { address: dashMatch[1].trim(), rent: dashMatch[2].replace(/,/g, "") };

  // Try: Address | 800
  const pipeMatch = trimmed.match(/^(.+?)\s*\|\s*£?\s*(\d[\d,]*)\s*$/);
  if (pipeMatch) return { address: pipeMatch[1].trim(), rent: pipeMatch[2].replace(/,/g, "") };

  // Try: Address, 800 (comma + number at end)
  const commaMatch = trimmed.match(/^(.+?),\s*£?\s*(\d[\d,]*)\s*$/);
  if (commaMatch) return { address: commaMatch[1].trim(), rent: commaMatch[2].replace(/,/g, "") };

  // Try: tab-separated
  const tabParts = trimmed.split("\t").map(p => p.trim());
  if (tabParts.length >= 2) {
    const rentVal = tabParts[tabParts.length - 1].replace(/[£,]/g, "");
    if (/^\d+$/.test(rentVal)) {
      return { address: tabParts.slice(0, -1).join(", "), rent: rentVal };
    }
  }

  // Fallback: just address, no rent
  return { address: trimmed, rent: "" };
}

const HomesStep = ({ onNext, onBack }: HomesStepProps) => {
  const { data, setHomes } = useWizardData();
  const [homes, setLocalHomes] = useState<HomeEntry[]>(data.homes);
  const [address, setAddress] = useState("");
  const [rent, setRent] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editRent, setEditRent] = useState("");

  // Sync local state FROM context when context changes externally (e.g. scenario load)
  const isLocalUpdate = useRef(false);
  useEffect(() => {
    if (!isLocalUpdate.current) {
      setLocalHomes(data.homes);
    }
    isLocalUpdate.current = false;
  }, [data.homes]);

  // Sync TO context when local homes change
  useEffect(() => {
    isLocalUpdate.current = true;
    setHomes(homes);
  }, [homes, setHomes]);

  const addHome = () => {
    if (address.trim()) {
      setLocalHomes([...homes, { address: address.trim(), rent: rent.trim() }]);
      setAddress("");
      setRent("");
    }
  };

  const removeHome = (index: number) => {
    if (editIndex === index) cancelEdit();
    setLocalHomes(homes.filter((_, i) => i !== index));
  };

  const startEdit = (index: number) => {
    setEditIndex(index);
    setEditAddress(homes[index].address);
    setEditRent(homes[index].rent);
  };

  const saveEdit = () => {
    if (editIndex !== null && editAddress.trim()) {
      setLocalHomes(homes.map((h, i) => i === editIndex ? { address: editAddress.trim(), rent: editRent.trim() } : h));
      cancelEdit();
    }
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setEditAddress("");
    setEditRent("");
  };

  const handleBulkPaste = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const newHomes: HomeEntry[] = lines.map(parseBulkLine);
    if (newHomes.length > 0) {
      setLocalHomes([...homes, ...newHomes]);
      setBulkText("");
      setShowBulk(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 px-6 max-w-6xl mx-auto w-full">
      <div className="flex-1 space-y-6 max-w-lg w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
            Which homes are on your <span className="text-accent">list</span>?
          </h2>
          <p className="text-muted-foreground mt-2">Add a few options. We'll compare them properly.</p>
        </motion.div>

        {/* Add Home Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
          <div className="flex gap-2">
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHome()}
              placeholder="Address or neighborhood..."
              className="flex-1 h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            />
            <input type="text" value={rent} onChange={(e) => setRent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHome()}
              placeholder="Rent £/mo"
              className="w-28 h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            />
            <PrimaryButton size="icon" variant="accent" onClick={addHome}>
              <Plus className="h-5 w-5" />
            </PrimaryButton>
          </div>

          <button onClick={() => setShowBulk(!showBulk)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <ClipboardPaste className="h-3.5 w-3.5" />
            {showBulk ? "Hide bulk paste" : "Paste multiple homes at once"}
          </button>

          <AnimatePresence>
            {showBulk && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="space-y-2 pt-1">
                  <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                    placeholder={"One home per line. Formats supported:\n42 Oak Street, 1200\nMaple Avenue 5 - £950\n10 High Rd | 800\nDowntown loft (1100)\nJust an address"}
                    rows={5}
                    className="w-full px-4 py-3 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all text-sm resize-none"
                  />
                  <PrimaryButton size="sm" onClick={handleBulkPaste} disabled={!bulkText.trim()}>
                    Add all homes
                  </PrimaryButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Home Cards */}
        <div className="space-y-3 min-h-[80px]">
          <AnimatePresence mode="popLayout">
            {homes.map((home, index) => (
              <motion.div key={`${home.address}-${index}`} layout
                initial={{ opacity: 0, x: -30, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.9 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                <div className={`bg-card rounded-2xl homescope-card-shadow p-4 flex items-center gap-4 ${editIndex === index ? "ring-2 ring-accent/40" : ""}`}>
                  <div className={`shrink-0 ${HOUSE_COLORS[index % HOUSE_COLORS.length]}`}>
                    <Home className="h-8 w-8" />
                  </div>
                  {editIndex === index ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <div className="flex gap-2">
                        <input type="text" value={editRent} onChange={(e) => setEditRent(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          placeholder="Rent £/mo"
                          className="w-28 h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                        <button onClick={saveEdit} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={cancelEdit} className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{home.address}</p>
                        {home.rent && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <DollarSign className="h-3 w-3" /> £{home.rent}/mo
                          </p>
                        )}
                      </div>
                      <button onClick={() => startEdit(index)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-secondary">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeHome(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-secondary">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {homes.length === 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center text-muted-foreground py-6 text-sm">
              Add homes you're considering above
            </motion.p>
          )}
        </div>

        {/* Navigation */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex gap-3 pt-2">
          <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
          <PrimaryButton onClick={onNext} className="flex-1" disabled={homes.length === 0}>
            Continue →
          </PrimaryButton>
        </motion.div>
      </div>

      {/* Illustration */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }} className="flex-1 max-w-md hidden lg:flex flex-col items-center gap-4">
        <div className="flex gap-3 justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.15, duration: 0.5, ease: "easeOut" }}>
              <motion.div animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}>
                <Home className={`h-10 w-10 ${HOUSE_COLORS[i % HOUSE_COLORS.length]}`} />
              </motion.div>
            </motion.div>
          ))}
        </div>
        <img src={homesGrid} alt="Homes illustrations" className="w-full h-auto rounded-2xl" />
      </motion.div>
    </div>
  );
};

export default HomesStep;
