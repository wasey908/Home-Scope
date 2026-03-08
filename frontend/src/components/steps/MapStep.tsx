import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { Home, MapPin, Eye, EyeOff, Navigation } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface MapStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface MapHome {
  id: string;
  label: string;
  x: number;
  y: number;
  rent: number;
  score: number;
}

interface MapPlace {
  id: string;
  label: string;
  x: number;
  y: number;
  type: string;
}

const HOMES: MapHome[] = [
  { id: "h1", label: "Elm Street Flat", x: 220, y: 180, rent: 1200, score: 92 },
  { id: "h2", label: "Oak Avenue Apt", x: 520, y: 120, rent: 1450, score: 85 },
  { id: "h3", label: "River Lane House", x: 380, y: 340, rent: 980, score: 78 },
];

const PLACES: MapPlace[] = [
  { id: "p1", label: "Office", x: 600, y: 280, type: "work" },
  { id: "p2", label: "Gym", x: 150, y: 320, type: "fitness" },
  { id: "p3", label: "Grocery Store", x: 450, y: 200, type: "shopping" },
  { id: "p4", label: "Park", x: 300, y: 80, type: "leisure" },
];

const ROUTES: Record<string, { placeId: string; path: string }[]> = {
  h1: [
    { placeId: "p1", path: "M220,180 C320,180 480,230 600,280" },
    { placeId: "p2", path: "M220,180 C190,220 160,280 150,320" },
    { placeId: "p3", path: "M220,180 C300,170 380,190 450,200" },
    { placeId: "p4", path: "M220,180 C240,140 270,100 300,80" },
  ],
  h2: [
    { placeId: "p1", path: "M520,120 C560,170 580,230 600,280" },
    { placeId: "p2", path: "M520,120 C380,160 250,250 150,320" },
    { placeId: "p3", path: "M520,120 C490,150 470,180 450,200" },
    { placeId: "p4", path: "M520,120 C440,90 360,80 300,80" },
  ],
  h3: [
    { placeId: "p1", path: "M380,340 C450,320 530,300 600,280" },
    { placeId: "p2", path: "M380,340 C300,340 220,330 150,320" },
    { placeId: "p3", path: "M380,340 C400,290 430,240 450,200" },
    { placeId: "p4", path: "M380,340 C360,250 330,160 300,80" },
  ],
};

const MapStep = ({ onNext, onBack }: MapStepProps) => {
  const [selectedHome, setSelectedHome] = useState<string | null>(null);
  const [showHomes, setShowHomes] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  const activeRoutes = useMemo(() => {
    if (!selectedHome || !showRoutes) return [];
    return ROUTES[selectedHome] || [];
  }, [selectedHome, showRoutes]);

  const selectedHomeData = HOMES.find((h) => h.id === selectedHome);

  return (
    <div className="flex flex-col items-center gap-6 px-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center"
      >
        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
          Explore the <span className="text-primary">Map</span>
        </h2>
        <p className="text-muted-foreground mt-2">
          Click a home to see its routes to your places.
        </p>
      </motion.div>

      {/* Toggle controls */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-4 justify-center"
      >
        {[
          { label: "Homes", icon: Home, value: showHomes, set: setShowHomes },
          { label: "Places", icon: MapPin, value: showPlaces, set: setShowPlaces },
          { label: "Routes", icon: Navigation, value: showRoutes, set: setShowRoutes },
        ].map((toggle) => (
          <label
            key={toggle.label}
            className="flex items-center gap-2 px-3 py-2 bg-card rounded-xl homescope-card-shadow cursor-pointer select-none"
          >
            <toggle.icon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{toggle.label}</span>
            <Switch checked={toggle.value} onCheckedChange={toggle.set} />
          </label>
        ))}
      </motion.div>

      {/* Map area */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="w-full aspect-[16/9] max-h-[420px] bg-homescope-cream rounded-2xl homescope-card-shadow overflow-hidden relative"
      >
        <svg
          viewBox="0 0 750 400"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines for map feel */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <line
              key={`vl-${i}`}
              x1={i * 100 + 50}
              y1={0}
              x2={i * 100 + 50}
              y2={400}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              opacity={0.4}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <line
              key={`hl-${i}`}
              x1={0}
              y1={i * 100 + 50}
              x2={750}
              y2={i * 100 + 50}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              opacity={0.4}
            />
          ))}

          {/* Routes */}
          <AnimatePresence>
            {activeRoutes.map((route) => (
              <motion.path
                key={`${selectedHome}-${route.placeId}`}
                d={route.path}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="8 4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.7 }}
                exit={{ pathLength: 0, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            ))}
          </AnimatePresence>

          {/* Places */}
          <AnimatePresence>
            {showPlaces &&
              PLACES.map((place, i) => (
                <motion.g
                  key={place.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: 0.4 + i * 0.08, type: "spring", stiffness: 300 }}
                  style={{ originX: `${place.x}px`, originY: `${place.y}px` }}
                >
                  <circle cx={place.x} cy={place.y} r={18} fill="hsl(var(--accent))" opacity={0.25} />
                  <circle cx={place.x} cy={place.y} r={10} fill="hsl(var(--accent))" />
                  <text
                    x={place.x}
                    y={place.y + 28}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={500}
                    fill="hsl(var(--foreground))"
                  >
                    {place.label}
                  </text>
                </motion.g>
              ))}
          </AnimatePresence>

          {/* Homes */}
          <AnimatePresence>
            {showHomes &&
              HOMES.map((home, i) => {
                const isSelected = selectedHome === home.id;
                return (
                  <motion.g
                    key={home.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 260 }}
                    style={{ cursor: "pointer", originX: `${home.x}px`, originY: `${home.y}px` }}
                    onClick={() => setSelectedHome(isSelected ? null : home.id)}
                    whileHover={{ scale: 1.15 }}
                  >
                    {isSelected && (
                      <motion.circle
                        cx={home.x}
                        cy={home.y}
                        r={24}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        initial={{ r: 14, opacity: 0 }}
                        animate={{ r: 24, opacity: [0, 0.6, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                    <rect
                      x={home.x - 14}
                      y={home.y - 14}
                      width={28}
                      height={28}
                      rx={8}
                      fill={isSelected ? "hsl(var(--primary))" : "hsl(var(--card))"}
                      stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}
                      strokeWidth={2}
                    />
                    <text
                      x={home.x}
                      y={home.y + 5}
                      textAnchor="middle"
                      fontSize={14}
                    >
                      🏠
                    </text>
                    <text
                      x={home.x}
                      y={home.y - 22}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill={isSelected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                    >
                      {home.label}
                    </text>
                  </motion.g>
                );
              })}
          </AnimatePresence>
        </svg>
      </motion.div>

      {/* Selected home info panel */}
      <AnimatePresence mode="wait">
        {selectedHomeData && (
          <motion.div
            key={selectedHomeData.id}
            initial={{ opacity: 0, y: 16, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 16, height: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-md bg-card rounded-2xl homescope-card-shadow p-5 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg homescope-gradient-green flex items-center justify-center text-sm">
                  🏠
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{selectedHomeData.label}</p>
                  <p className="text-xs text-muted-foreground">${selectedHomeData.rent}/mo</p>
                </div>
              </div>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold">
                {selectedHomeData.score}%
              </div>
            </div>
            <div className="space-y-2">
              {PLACES.map((place) => (
                <div key={place.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {place.label}
                  </span>
                  <span className="text-foreground font-medium">
                    {Math.round(
                      Math.sqrt(
                        Math.pow(selectedHomeData.x - place.x, 2) +
                          Math.pow(selectedHomeData.y - place.y, 2)
                      ) * 0.08
                    )}{" "}
                    min
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3"
      >
        <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
        <PrimaryButton onClick={onNext}>Get Help & Tips →</PrimaryButton>
      </motion.div>
    </div>
  );
};

export default MapStep;
