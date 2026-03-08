import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { useEffect, useState, useRef, useCallback } from "react";
import { Home, MapPin, Briefcase, GraduationCap, Dumbbell, Coffee, AlertTriangle, X, ArrowLeft, RotateCcw } from "lucide-react";
import { useWizardData } from "@/lib/wizardContext";
import { useJsApiLoader } from "@react-google-maps/api";
import { geocodeAddress, type GeocodedLocation } from "@/lib/geocodeCache";
import { computeAllRoutes, type RouteRequest } from "@/lib/directionsService";
import { computeScores } from "@/lib/scoringEngine";
import { type TravelMode, type TimeWindowId, TIME_WINDOWS, type CalculationProgress } from "@/lib/routingTypes";

interface CalculatingStepProps {
  onNext: () => void;
  onBack?: () => void;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyBfqDpKqiWqT4dPhjjotLej_mth2PN_ngc";

const MODES: TravelMode[] = ["transit", "driving", "walking"];

const NODES = {
  homes: [
    { x: 15, y: 25 }, { x: 10, y: 55 }, { x: 18, y: 80 },
  ],
  places: [
    { x: 82, y: 18 }, { x: 88, y: 40 }, { x: 78, y: 60 }, { x: 85, y: 78 }, { x: 90, y: 92 },
  ],
};

const placeIcons = [Briefcase, GraduationCap, Dumbbell, Coffee, MapPin];

const CalculatingStep = ({ onNext, onBack }: CalculatingStepProps) => {
  const { data, setRoutes, setScores, setFailedRouteCount } = useWizardData();
  const [progress, setProgress] = useState<CalculationProgress>({
    totalRequests: 0, completedRequests: 0, failedRequests: 0,
    currentLabel: "Preparing calculations…", cancelled: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const { isLoaded: mapsLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });

  const pct = progress.totalRequests > 0
    ? Math.round((progress.completedRequests / progress.totalRequests) * 100)
    : 0;

  const runCalculation = useCallback(async () => {
    if (!mapsLoaded) return;
    setError(null);
    setDone(false);
    setProgress({ totalRequests: 0, completedRequests: 0, failedRequests: 0, currentLabel: "Preparing calculations…", cancelled: false });

    const geocoder = new google.maps.Geocoder();

    // Step 1: Geocode all addresses
    setProgress((p) => ({ ...p, currentLabel: "Geocoding addresses…" }));

    const homeGeos: (GeocodedLocation | null)[] = [];
    for (const home of data.homes) {
      if (cancelRef.current.cancelled) return;
      const geo = home.address.trim() ? await geocodeAddress(home.address, geocoder) : null;
      homeGeos.push(geo);
    }

    const placeGeos: (GeocodedLocation | null)[] = [];
    for (const place of data.places) {
      if (cancelRef.current.cancelled) return;
      const geo = place.address.trim() ? await geocodeAddress(place.address, geocoder) : null;
      placeGeos.push(geo);
    }

    const validHomes = homeGeos.map((g, i) => g ? { idx: i, geo: g } : null).filter(Boolean) as { idx: number; geo: GeocodedLocation }[];
    const validPlaces = placeGeos.map((g, i) => g ? { idx: i, geo: g } : null).filter(Boolean) as { idx: number; geo: GeocodedLocation }[];

    if (validHomes.length === 0 || validPlaces.length === 0) {
      setError("Could not geocode enough addresses. Please check your home and place addresses and try again.");
      return;
    }

    // Step 2: Build route requests
    const requests: RouteRequest[] = [];
    for (const home of validHomes) {
      for (const place of validPlaces) {
        for (const mode of MODES) {
          for (const tw of TIME_WINDOWS) {
            requests.push({
              homeId: home.idx, homeLat: home.geo.lat, homeLng: home.geo.lng,
              placeId: place.idx, placeLat: place.geo.lat, placeLng: place.geo.lng,
              mode, timeWindow: tw.id,
            });
          }
        }
      }
    }

    setProgress((p) => ({ ...p, totalRequests: requests.length, currentLabel: "Fetching routes…" }));

    try {
      const routes = await computeAllRoutes(requests, setProgress, cancelRef.current);
      if (cancelRef.current.cancelled) return;

      setRoutes(routes);

      // Store failed count for display on Results page
      const finalProgress = { ...progress };
      // Get latest progress state
      setProgress((p) => {
        setFailedRouteCount(p.failedRequests);
        return { ...p, currentLabel: "Scoring homes…" };
      });

      const homeInputs = validHomes.map((h) => ({
        id: h.idx, address: data.homes[h.idx].address,
        rentMonthlyGBP: parseInt(data.homes[h.idx].rent.replace(/[^\d]/g, "")) || 1000,
        lat: h.geo.lat, lng: h.geo.lng,
      }));

      const placeInputs = validPlaces.map((p) => ({
        id: p.idx, name: data.places[p.idx].name, weight: data.places[p.idx].importance,
      }));

      if (routes.length > 0) {
        const scores = await computeScores(routes, homeInputs, placeInputs, data.routingSettings, {});
        setScores(scores);
        setDone(true);
      } else {
        setError("All route requests failed. Please check your API key and addresses.");
      }
    } catch (e: any) {
      console.error("Calculation error:", e);
      setError(e.message || "An unexpected error occurred during calculation.");
    }
  }, [mapsLoaded, data.homes, data.places, data.routingSettings, setRoutes, setScores]);

  useEffect(() => {
    cancelRef.current = { cancelled: false };
    if (mapsLoaded) {
      runCalculation();
    }
    return () => { cancelRef.current.cancelled = true; };
  }, [mapsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onNext, 800);
    return () => clearTimeout(t);
  }, [done, onNext]);

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
    setProgress((p) => ({ ...p, cancelled: true, currentLabel: "Cancelled" }));
  };

  const handleRetry = () => {
    cancelRef.current = { cancelled: false };
    runCalculation();
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 max-w-3xl mx-auto w-full min-h-[60vh]">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-serif font-bold text-foreground text-center">Calculation Failed</h2>
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          Common causes: Directions API not enabled, billing not active, API key restrictions, or network issues.
          Check the browser console for details.
        </p>
        <div className="flex gap-3">
          <PrimaryButton onClick={handleRetry}>
            <RotateCcw className="h-4 w-4 mr-2" /> Retry calculation
          </PrimaryButton>
          {onBack && (
            <SecondaryButton onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Edit addresses
            </SecondaryButton>
          )}
        </div>
        {progress.failedRequests > 0 && progress.completedRequests > 0 && (
          <SecondaryButton onClick={onNext}>
            See partial results ({progress.completedRequests - progress.failedRequests} routes)
          </SecondaryButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 max-w-3xl mx-auto w-full min-h-[60vh]">
      {/* Animated route visualization */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="relative w-full max-w-md h-52">
        <div className="absolute inset-0 rounded-2xl bg-secondary/40 overflow-hidden">
          <svg className="w-full h-full opacity-10" viewBox="0 0 100 100">
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="currentColor" strokeWidth="0.3" className="text-foreground" />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="currentColor" strokeWidth="0.3" className="text-foreground" />
            ))}
          </svg>
        </div>

        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {NODES.homes.map((home, hi) =>
            NODES.places.map((place, pi) => (
              <motion.line key={`${hi}-${pi}`} x1={home.x} y1={home.y} x2={place.x} y2={place.y}
                stroke="hsl(var(--primary))" strokeWidth="0.4" strokeDasharray="2 2"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.5, 0.2] }}
                transition={{ duration: 2, delay: (hi * NODES.places.length + pi) * 0.3, repeat: Infinity, repeatDelay: 1 }}
              />
            ))
          )}
        </svg>

        {NODES.homes.map((home, hi) =>
          NODES.places.slice(0, 3).map((place, pi) => (
            <motion.div key={`dot-${hi}-${pi}`} className="absolute w-2 h-2 rounded-full bg-accent"
              style={{ left: `${home.x}%`, top: `${home.y}%` }}
              animate={{ left: [`${home.x}%`, `${place.x}%`], top: [`${home.y}%`, `${place.y}%`], opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.5] }}
              transition={{ duration: 2.5, delay: (hi * 3 + pi) * 0.6, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
            />
          ))
        )}

        {NODES.homes.map((pos, i) => (
          <motion.div key={`home-${i}`} className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
            animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}>
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Home className="h-5 w-5 text-primary" />
            </div>
          </motion.div>
        ))}

        {NODES.places.map((pos, i) => {
          const Icon = placeIcons[i % placeIcons.length];
          return (
            <motion.div key={`place-${i}`} className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
              animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}>
              <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center">
                <Icon className="h-4 w-4 text-accent" />
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Text */}
      <div className="text-center space-y-2">
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
          Finding homes that fit your <span className="text-primary">life</span>…
        </motion.h2>
        <AnimatePresence mode="wait">
          <motion.p key={progress.currentLabel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="text-muted-foreground text-sm">
            {progress.currentLabel}
          </motion.p>
        </AnimatePresence>
        {progress.totalRequests > 0 && (
          <p className="text-xs text-muted-foreground">
            {progress.completedRequests} / {progress.totalRequests} routes
            {progress.failedRequests > 0 && <span className="text-destructive ml-2">({progress.failedRequests} failed)</span>}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm space-y-2">
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <motion.div className="h-full homescope-gradient-green rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground text-center">{pct}%</p>
      </div>

      {/* Cancel / Continue */}
      <div className="flex gap-3">
        {!done && !progress.cancelled && (
          <SecondaryButton onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </SecondaryButton>
        )}
        <AnimatePresence>
          {(done || progress.cancelled) && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <PrimaryButton size="lg" onClick={onNext}>
                {done ? "See Your Results ✨" : "See Partial Results"}
              </PrimaryButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CalculatingStep;
