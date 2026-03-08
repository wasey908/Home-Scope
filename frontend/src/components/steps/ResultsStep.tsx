import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import {
  Heart, ThumbsDown, ChevronRight, Trophy, Clock, MapPin,
  ArrowLeft, RotateCcw, Home, Brain, Sparkles, X, Navigation,
  Maximize2, HelpCircle, Compass, BarChart3, AlertTriangle, Save, RefreshCw, FolderOpen,
  Train, Car, Footprints, TrendingUp, Shield, Pencil,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { AnimatedCard } from "@/components/WizardComponents";
import { updateScenario } from "@/lib/scenarios";
import { useToast } from "@/hooks/use-toast";
import { useWizardData } from "@/lib/wizardContext";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline } from "@react-google-maps/api";
import { geocodeAddress, type GeocodedLocation } from "@/lib/geocodeCache";
import { computeScores } from "@/lib/scoringEngine";
import {
  type RoutingSettings, type HomeScore, type TravelMode, type TimeWindowId,
  TIME_WINDOWS, DEFAULT_ROUTING_SETTINGS, METERS_TO_MILES,
} from "@/lib/routingTypes";
import {
  loadWeights, resetWeights, updateWeights, computeAverageFeatures,
  getInteractionCount,
  type PreferenceWeights, type HomeFeatureVector,
} from "@/lib/preferenceLearning";

interface ResultsStepProps {
  onBack: () => void;
  onRestart: () => void;
  scenarioId?: string | null;
  onGoToLibrary?: () => void;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyBfqDpKqiWqT4dPhjjotLej_mth2PN_ngc";

const scoreColor = (score: number) => {
  if (score >= 90) return "text-primary";
  if (score >= 75) return "text-accent";
  if (score >= 60) return "text-muted-foreground";
  return "text-destructive";
};

const barColor = (score: number) => {
  if (score >= 90) return "bg-primary";
  if (score >= 75) return "bg-accent";
  if (score >= 60) return "bg-muted-foreground/40";
  return "bg-destructive/60";
};

const scoreEmoji = (score: number) => {
  if (score >= 90) return "🏆";
  if (score >= 80) return "🌟";
  if (score >= 70) return "👍";
  if (score >= 60) return "🤔";
  return "😬";
};

const rankBadgeStyle = (rank: number) => {
  if (rank === 1) return "homescope-gradient-orange text-accent-foreground";
  if (rank === 2) return "bg-primary/15 text-primary";
  if (rank === 3) return "bg-secondary text-foreground";
  return "bg-secondary/60 text-muted-foreground";
};

const variabilityBadgeColor = (label: string) => {
  if (label === "Stable") return "text-primary bg-primary/10";
  if (label === "Moderate") return "text-accent bg-accent/10";
  return "text-destructive bg-destructive/10";
};

const robustnessBadgeColor = (label: string) => {
  if (label === "Very reliable") return "text-primary bg-primary/10";
  if (label === "Reliable") return "text-accent bg-accent/10";
  return "text-destructive bg-destructive/10";
};

const helpSections = [
  { icon: Compass, title: "How HomeScope works", body: "Homes are ranked using real Google Directions data across transit, driving, and walking modes. Each home is scored on commute time, stability, and reliability." },
  { icon: BarChart3, title: "What the scores mean", body: "The total score combines weighted commute time (70%), commute stability across peak/off-peak (15%), and route reliability (15%). These weights are fixed internally." },
  { icon: Brain, title: "Mode blending", body: "The mode blend slider controls how much weight transit, driving, and walking get in the overall ranking. Adjust it to match your lifestyle." },
  { icon: AlertTriangle, title: "Limitations", body: "Travel times come from Google Directions and vary by day. Stability is estimated from 3 time windows. Reliability uses fallback routes when available." },
];

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false, zoomControl: true, fullscreenControl: true,
  mapTypeControl: false, streetViewControl: false,
  styles: [
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#c9e8f0" }] },
    { featureType: "landscape", elementType: "geometry.fill", stylers: [{ color: "#f5f0e8" }] },
  ],
};

const defaultCenter = { lat: 51.51, lng: -0.12 };

const modeIcon = (mode: TravelMode) => {
  switch (mode) {
    case "transit": return Train;
    case "driving": return Car;
    case "walking": return Footprints;
  }
};

const modeEmoji = (mode: TravelMode) => {
  switch (mode) {
    case "transit": return "🚇";
    case "driving": return "🚗";
    case "walking": return "🚶";
  }
};

const POLYLINE_COLORS: Record<TravelMode, { color: string; dash?: number[] }> = {
  transit: { color: "#3b82f6" },
  driving: { color: "#22c55e" },
  walking: { color: "#f97316", dash: [8, 8] },
};

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const ResultsStep = ({ onBack, onRestart, scenarioId, onGoToLibrary }: ResultsStepProps) => {
  const { toast } = useToast();
  const { data: wizardData, setScores: setContextScores } = useWizardData();
  const [statuses, setStatuses] = useState<Record<number, "neutral" | "liked" | "disliked">>({});
  const [detailId, setDetailId] = useState<number | null>(null);
  const [selectedHomeId, setSelectedHomeId] = useState<number | null>(null);
  const [showHomes, setShowHomes] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [infoWindowId, setInfoWindowId] = useState<string | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const mapRef = useRef<google.maps.Map | null>(null);

  // Preference learning
  const [prefWeights, setPrefWeights] = useState<PreferenceWeights | null>(null);
  const [interactionCount, setInteractionCount] = useState(0);
  const [learningActive, setLearningActive] = useState(false);

  // Load weights on mount
  useEffect(() => {
    loadWeights().then(setPrefWeights);
    getInteractionCount().then(setInteractionCount);
  }, []);

  // Route polyline state
  const [activePolyline, setActivePolyline] = useState<{ homeId: number; placeId: number; mode: TravelMode } | null>(null);

  // Local settings for mode blend
  const [localSettings, setLocalSettings] = useState<RoutingSettings>(wizardData.routingSettings);

  // Geocoded coordinates
  const [homeGeoLocations, setHomeGeoLocations] = useState<Record<number, GeocodedLocation | null>>({});
  const [placeGeoLocations, setPlaceGeoLocations] = useState<Record<number, GeocodedLocation | null>>({});
  const [geocodingDone, setGeocodingDone] = useState(false);

  const { isLoaded: mapsLoaded, loadError: mapsLoadError } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });

  const userHomes = wizardData.homes;
  const userPlaces = wizardData.places;

  // Geocode addresses
  useEffect(() => {
    if (!mapsLoaded || !GOOGLE_MAPS_API_KEY) return;
    const geocoder = new google.maps.Geocoder();
    let cancelled = false;
    async function geocodeAll() {
      const homeResults: Record<number, GeocodedLocation | null> = {};
      const placeResults: Record<number, GeocodedLocation | null> = {};
      for (let i = 0; i < userHomes.length; i++) {
        if (cancelled) return;
        homeResults[i] = userHomes[i].address.trim() ? await geocodeAddress(userHomes[i].address, geocoder) : null;
      }
      for (let i = 0; i < userPlaces.length; i++) {
        if (cancelled) return;
        placeResults[i] = userPlaces[i].address.trim() ? await geocodeAddress(userPlaces[i].address, geocoder) : null;
      }
      if (!cancelled) {
        setHomeGeoLocations(homeResults);
        setPlaceGeoLocations(placeResults);
        setGeocodingDone(true);
      }
    }
    geocodeAll();
    return () => { cancelled = true; };
  }, [mapsLoaded, userHomes, userPlaces]);

  // Recompute scores using preference weights
  const [scores, setLocalScores] = useState<HomeScore[]>(wizardData.scores);

  useEffect(() => {
    if (wizardData.routes.length === 0 || userHomes.length === 0) {
      setLocalScores(wizardData.scores);
      return;
    }

    const validHomes = userHomes.map((h, i) => {
      const geo = homeGeoLocations[i];
      return geo ? { id: i, address: h.address, rentMonthlyGBP: parseInt(h.rent.replace(/[^\d]/g, "")) || 1000, lat: geo.lat, lng: geo.lng } : null;
    }).filter(Boolean) as { id: number; address: string; rentMonthlyGBP: number; lat: number; lng: number }[];

    const placeInputs = userPlaces.map((p, i) => ({ id: i, name: p.name, weight: p.importance }));
    if (validHomes.length === 0) {
      setLocalScores(wizardData.scores);
      return;
    }

    computeScores(wizardData.routes, validHomes, placeInputs, localSettings, {},
      interactionCount > 0 && prefWeights ? prefWeights : undefined
    ).then(setLocalScores);
  }, [wizardData.routes, localSettings, homeGeoLocations, userHomes, userPlaces, wizardData.scores, prefWeights, interactionCount]);

  // Compute average features for learning rule
  const averageFeatures = useMemo((): HomeFeatureVector => {
    const allFeatures = scores.filter(s => s.featureVector).map(s => s.featureVector!);
    return computeAverageFeatures(allFeatures);
  }, [scores]);

  const updateStatus = useCallback(async (id: number, status: "liked" | "disliked") => {
    setStatuses((prev) => {
      const newStatus: "neutral" | "liked" | "disliked" = prev[id] === status ? "neutral" : status;
      return { ...prev, [id]: newStatus };
    });

    const currentStatus = statuses[id];
    const newStatus = currentStatus === status ? "neutral" : status;

    if (newStatus !== "neutral" && prefWeights) {
      const home = scores.find(s => s.homeId === id);
      if (home?.featureVector) {
        const direction = newStatus === "liked" ? 1 : -1;
        const newWeights = await updateWeights(prefWeights, home.featureVector, averageFeatures, direction as 1 | -1);
        setPrefWeights(newWeights);
        const count = await getInteractionCount();
        setInteractionCount(count);
        setLearningActive(true);
        setTimeout(() => setLearningActive(false), 2000);
      }
    }
  }, [prefWeights, averageFeatures, scores, statuses]);

  const handleResetLearning = useCallback(async () => {
    setStatuses({});
    const w = await resetWeights();
    setPrefWeights(w);
    setInteractionCount(0);
  }, []);

  const detailHome = detailId !== null ? scores.find((s) => s.homeId === detailId) : null;
  const selectedHome = selectedHomeId !== null ? scores.find((s) => s.homeId === selectedHomeId) : null;

  const handleSave = async () => {
    const scenario = { savedAt: new Date().toISOString(), step: "complete" };
    if (scenarioId) {
      await updateScenario(scenarioId, { lastCompletedStep: 5, results: scenario });
    }
    toast({ title: "Scenario saved successfully", description: "Saved to your account." });
  };

  const handleModeWeightChange = (mode: TravelMode, value: number) => {
    setLocalSettings((prev) => {
      const w = { ...prev.modeBlendWeights, [mode]: value };
      const total = w.transit + w.driving + w.walking;
      if (total > 0) {
        w.transit = +(w.transit / total).toFixed(2);
        w.driving = +(w.driving / total).toFixed(2);
        w.walking = +(w.walking / total).toFixed(2);
      }
      return { ...prev, modeBlendWeights: w };
    });
  };

  // Route polyline click handler
  const handleRouteClick = useCallback((homeId: number, placeId: number, mode: TravelMode) => {
    if (activePolyline?.homeId === homeId && activePolyline?.placeId === placeId && activePolyline?.mode === mode) {
      setActivePolyline(null);
      return;
    }
    setActivePolyline({ homeId, placeId, mode });
  }, [activePolyline]);

  // Get decoded polyline for active route
  const activePolylinePath = useMemo(() => {
    if (!activePolyline) return null;
    const route = wizardData.routes.find(
      r => r.homeId === activePolyline.homeId && r.placeId === activePolyline.placeId &&
        r.mode === activePolyline.mode && r.timeWindow === "weekday_peak_8am"
    ) || wizardData.routes.find(
      r => r.homeId === activePolyline.homeId && r.placeId === activePolyline.placeId &&
        r.mode === activePolyline.mode
    );
    if (!route?.polyline) return null;
    try {
      const encoded = typeof route.polyline === "string" ? route.polyline : (route.polyline as any)?.points || "";
      if (!encoded) return null;
      return decodePolyline(encoded);
    } catch { return null; }
  }, [activePolyline, wizardData.routes]);

  // Fit map to polyline when active
  useEffect(() => {
    if (activePolylinePath && mapRef.current) {
      const bounds = new google.maps.LatLngBounds();
      activePolylinePath.forEach(p => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [activePolylinePath]);

  // Fit map to all markers
  const fitBounds = useCallback((map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    Object.values(homeGeoLocations).forEach((g) => { if (g) { bounds.extend({ lat: g.lat, lng: g.lng }); hasPoints = true; } });
    Object.values(placeGeoLocations).forEach((g) => { if (g) { bounds.extend({ lat: g.lat, lng: g.lng }); hasPoints = true; } });
    if (hasPoints) {
      map.fitBounds(bounds, 50);
      const listener = google.maps.event.addListener(map, "idle", () => {
        if (map.getZoom()! > 15) map.setZoom(15);
        google.maps.event.removeListener(listener);
      });
    }
  }, [homeGeoLocations, placeGeoLocations]);

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; fitBounds(map); }, [fitBounds]);
  useEffect(() => { if (geocodingDone && mapRef.current) fitBounds(mapRef.current); }, [geocodingDone, fitBounds]);

  const mapCenter = useMemo(() => {
    for (const g of Object.values(homeGeoLocations)) { if (g) return { lat: g.lat, lng: g.lng }; }
    for (const g of Object.values(placeGeoLocations)) { if (g) return { lat: g.lat, lng: g.lng }; }
    return defaultCenter;
  }, [homeGeoLocations, placeGeoLocations]);

  const geocodeFailures = useMemo(() => {
    const failures: string[] = [];
    userHomes.forEach((h, i) => { if (geocodingDone && !homeGeoLocations[i] && h.address.trim()) failures.push(`Home: ${h.address}`); });
    userPlaces.forEach((p, i) => { if (geocodingDone && !placeGeoLocations[i] && p.address.trim()) failures.push(`Place: ${p.name}`); });
    return failures;
  }, [userHomes, userPlaces, homeGeoLocations, placeGeoLocations, geocodingDone]);

  const hasRoutes = wizardData.routes.length > 0;

  const renderMap = (heightClass: string) => {
    if (!GOOGLE_MAPS_API_KEY) {
      return (
        <div className={`${heightClass} min-h-[500px] w-full rounded-2xl overflow-hidden homescope-card-shadow bg-secondary/40 flex flex-col items-center justify-center gap-3 p-6`}>
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground text-center">Google Maps API key required</p>
        </div>
      );
    }
    if (mapsLoadError) {
      return (
        <div className={`${heightClass} min-h-[500px] w-full rounded-2xl overflow-hidden homescope-card-shadow bg-destructive/10 flex flex-col items-center justify-center gap-3 p-6`}>
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm font-bold text-destructive">Google Maps failed to load</p>
          <p className="text-xs text-destructive/80 text-center max-w-md font-mono">{mapsLoadError.message}</p>
        </div>
      );
    }
    if (!mapsLoaded) {
      return (
        <div className={`${heightClass} min-h-[500px] w-full rounded-2xl overflow-hidden homescope-card-shadow bg-secondary/40 flex items-center justify-center`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
            <MapPin className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-xs text-muted-foreground ml-2">Loading Google Maps…</p>
        </div>
      );
    }

    return (
      <div className={`${heightClass} min-h-[500px] w-full rounded-2xl overflow-hidden homescope-card-shadow relative`}>
        {geocodeFailures.length > 0 && (
          <div className="absolute top-3 left-3 right-3 z-10 bg-accent/90 text-accent-foreground text-xs rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Some addresses couldn't be located:</p>
              {geocodeFailures.map((f, i) => <p key={i} className="opacity-80">{f}</p>)}
            </div>
          </div>
        )}
        <GoogleMap mapContainerStyle={mapContainerStyle} center={mapCenter} zoom={12} options={mapOptions} onLoad={onMapLoad}>
          {activePolylinePath && activePolyline && (
            <Polyline
              path={activePolylinePath}
              options={{
                strokeColor: POLYLINE_COLORS[activePolyline.mode].color,
                strokeWeight: 5,
                strokeOpacity: 0.85,
                geodesic: true,
                ...(POLYLINE_COLORS[activePolyline.mode].dash
                  ? { icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 }, offset: "0", repeat: "16px" }], strokeOpacity: 0 }
                  : {}
                ),
              }}
            />
          )}
          {showHomes && Object.entries(homeGeoLocations).map(([idx, geo]) => {
            if (!geo) return null;
            const homeIdx = Number(idx);
            const isSelected = selectedHomeId === homeIdx;
            return (
              <Marker key={`home-${idx}`} position={{ lat: geo.lat, lng: geo.lng }}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="12" fill="${isSelected ? '#4a9470' : '#faf8f5'}" stroke="${isSelected ? '#3a7a5a' : '#d4cfc5'}" stroke-width="2.5"/><text x="20" y="26" text-anchor="middle" font-size="18">🏠</text></svg>`)}`,
                  scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20),
                }}
                onClick={() => {
                  setSelectedHomeId(selectedHomeId === homeIdx ? null : homeIdx);
                  setInfoWindowId(infoWindowId === `home-${idx}` ? null : `home-${idx}`);
                  const ref = cardRefs.current[homeIdx];
                  if (ref) ref.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }}
              >
                {infoWindowId === `home-${idx}` && (
                  <InfoWindow onCloseClick={() => setInfoWindowId(null)}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", padding: "2px" }}>
                      <strong>{userHomes[homeIdx]?.address}</strong><br />
                      <span style={{ color: "#888" }}>£{userHomes[homeIdx]?.rent}/mo</span>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            );
          })}
          {showPlaces && Object.entries(placeGeoLocations).map(([idx, geo]) => {
            if (!geo) return null;
            const placeIdx = Number(idx);
            return (
              <Marker key={`place-${idx}`} position={{ lat: geo.lat, lng: geo.lng }}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#e8782a" stroke="#c66520" stroke-width="2"/><text x="18" y="24" text-anchor="middle" font-size="15">📍</text></svg>`)}`,
                  scaledSize: new google.maps.Size(36, 36), anchor: new google.maps.Point(18, 18),
                }}
                onClick={() => setInfoWindowId(infoWindowId === `place-${idx}` ? null : `place-${idx}`)}
              >
                {infoWindowId === `place-${idx}` && (
                  <InfoWindow onCloseClick={() => setInfoWindowId(null)}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", padding: "2px" }}>
                      <strong>{userPlaces[placeIdx]?.name}</strong>
                      {userPlaces[placeIdx]?.address && <><br /><span style={{ color: "#888" }}>{userPlaces[placeIdx].address}</span></>}
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            );
          })}
        </GoogleMap>
      </div>
    );
  };

  // Empty state
  if (userHomes.length === 0 && userPlaces.length === 0) {
    return (
      <div className="px-6 max-w-2xl mx-auto w-full text-center py-16 space-y-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Home className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-serif font-bold text-foreground">No data yet</h2>
          <p className="text-muted-foreground mt-2">Add homes and places to see results.</p>
          <div className="flex gap-3 justify-center mt-6">
            <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
            <PrimaryButton onClick={onRestart}>Start Over</PrimaryButton>
          </div>
        </motion.div>
      </div>
    );
  }

  // Detail view
  if (detailHome) {
    return (
      <div className="px-6 max-w-3xl mx-auto w-full space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => { setDetailId(null); setActivePolyline(null); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to results
          </button>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground">{detailHome.address}</h2>
              <p className="text-sm text-muted-foreground">
                £{detailHome.rentMonthlyGBP}/mo · {detailHome.blendedCommuteMinutes} min avg commute
              </p>
            </div>
            <div className={`ml-auto text-3xl font-bold ${scoreColor(detailHome.totalScore)}`}>{detailHome.totalScore}</div>
          </div>
        </motion.div>

        {/* Summary row */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl homescope-card-shadow p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Rent</p>
            <p className="text-lg font-bold text-foreground">£{detailHome.rentMonthlyGBP}/mo</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg commute</p>
            <p className="text-lg font-bold text-primary">{detailHome.blendedCommuteMinutes} min</p>
          </div>
        </motion.div>

        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${variabilityBadgeColor(detailHome.variabilityLabel)}`}>
            <TrendingUp className="h-3 w-3 inline mr-1" />{detailHome.variabilityLabel} commute
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${robustnessBadgeColor(detailHome.robustnessLabel)}`}>
            <Shield className="h-3 w-3 inline mr-1" />{detailHome.robustnessLabel}
          </span>
        </div>

        {/* Mode comparison row */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl homescope-card-shadow p-4">
          <p className="text-sm font-medium text-foreground mb-3">Average by mode</p>
          <div className="grid grid-cols-3 gap-3">
            {(["transit", "driving", "walking"] as TravelMode[]).map((mode) => {
              const Icon = modeIcon(mode);
              const stats = detailHome.perModeStats[mode];
              return (
                <div key={mode} className="text-center space-y-1">
                  <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
                  <p className="text-sm font-bold text-foreground">{stats.avgMinutes} min</p>
                  <p className="text-[10px] text-muted-foreground">{stats.avgDistanceMiles} mi</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Per-place breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
          <p className="text-sm font-medium text-foreground">Per-place breakdown</p>
          {detailHome.perPlaceBreakdown.map((place) => (
            <AnimatedCard key={place.placeId} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-accent" /> {place.placeName}
                </span>
                <span className="text-xs text-muted-foreground">{place.blendedMinutes} min blended</span>
              </div>

              {/* Mode rows — clickable for polyline */}
              <div className="space-y-1.5">
                {(["transit", "driving", "walking"] as TravelMode[]).map((mode) => {
                  const bd = place.byMode[mode];
                  if (!bd || bd.durationMin >= 999) return null;
                  const isActive = activePolyline?.homeId === detailHome.homeId && activePolyline?.placeId === place.placeId && activePolyline?.mode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => handleRouteClick(detailHome.homeId, place.placeId, mode)}
                      className={`flex items-center gap-2 text-xs w-full text-left px-2 py-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary"
                        }`}
                    >
                      <span className="w-5">{modeEmoji(mode)}</span>
                      <span className="text-foreground font-medium w-16">{bd.durationMin} min</span>
                      <span className="text-muted-foreground">{bd.distanceMiles} mi</span>
                      {bd.transferCount !== undefined && bd.transferCount > 0 && (
                        <span className="text-muted-foreground">· {bd.transferCount} transfer{bd.transferCount > 1 ? "s" : ""}</span>
                      )}
                      {bd.walkingMin !== undefined && bd.walkingMin > 0 && (
                        <span className="text-muted-foreground">· {bd.walkingMin} min walk</span>
                      )}
                      <MapPin className="h-3 w-3 ml-auto text-muted-foreground/50" />
                    </button>
                  );
                })}
              </div>

              {/* Transit steps */}
              {place.byMode.transit?.steps && place.byMode.transit.steps.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Transit route</p>
                  {place.byMode.transit.steps.map((step, si) => (
                    <div key={si} className="flex items-center gap-2 text-xs">
                      {step.type === "walking" ? (
                        <><Footprints className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Walk {Math.round(step.durationSec / 60)} min</span></>
                      ) : (
                        <><Train className="h-3 w-3 text-primary" /><span className="text-foreground font-medium">{step.lineName}</span>
                          <span className="text-muted-foreground">{step.departureStop} → {step.arrivalStop}</span>
                          {step.numStops && <span className="text-muted-foreground">({step.numStops} stops)</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Time windows comparison */}
              <div className="border-t border-border pt-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Transit by time window</p>
                <div className="flex gap-3">
                  {TIME_WINDOWS.map((tw) => {
                    const dur = place.byTimeWindow[tw.id];
                    return (
                      <div key={tw.id} className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground">{tw.shortLabel}</p>
                        <p className="text-sm font-bold text-foreground">{dur > 0 ? Math.round(dur / 60) : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">min</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AnimatedCard>
          ))}
        </motion.div>

        {/* Map in detail view */}
        {activePolyline && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
            {renderMap("h-[400px]")}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="pt-2">
          <SecondaryButton onClick={() => { setDetailId(null); setActivePolyline(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to results
          </SecondaryButton>
        </motion.div>
      </div>
    );
  }

  // Main results + map layout
  return (
    <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-10 px-6 max-w-7xl mx-auto w-full">
      {/* Left: Results list */}
      <div className="flex-1 space-y-5 max-w-xl w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
            Your <span className="text-primary">Ranked Homes</span>
          </h2>
          <p className="text-muted-foreground mt-2">
            Ranked using real Google Directions data across transit, driving & walking.
          </p>
          {wizardData.routesStale && (
            <div className="mt-2 flex items-center gap-2 text-xs text-accent bg-accent/10 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5" />
              Results out of date — inputs changed since last calculation.
            </div>
          )}
          {wizardData.failedRouteCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-accent bg-accent/10 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5" />
              {wizardData.failedRouteCount} route{wizardData.failedRouteCount > 1 ? "s" : ""} failed during calculation. Results are based on available data.
            </div>
          )}
        </motion.div>

        {/* Mode blend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl homescope-card-shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Mode Blend</p>
            <p className="text-[10px] text-muted-foreground">How much each transport mode influences ranking</p>
          </div>
          <div className="space-y-2">
            {(["transit", "driving", "walking"] as TravelMode[]).map((mode) => {
              const Icon = modeIcon(mode);
              const w = localSettings.modeBlendWeights[mode];
              return (
                <div key={mode} className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground w-16 capitalize">{mode}</span>
                  <Slider
                    value={[w * 100]}
                    onValueChange={([v]) => handleModeWeightChange(mode, v / 100)}
                    max={100} step={5} className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(w * 100)}%</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Preference learning indicator */}
        <AnimatePresence>
          {learningActive && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 text-xs text-primary bg-primary/5 px-3 py-2 rounded-lg">
              <Brain className="h-3.5 w-3.5 animate-pulse" />
              <span>Learning from your preferences…</span>
            </motion.div>
          )}
          {interactionCount > 0 && !learningActive && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-primary" /> Preferences active ({interactionCount} interactions)</span>
              <button onClick={handleResetLearning} className="text-muted-foreground hover:text-foreground transition-colors underline">Reset learned preferences</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results cards */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {scores.map((home, index) => {
              const rank = index + 1;
              const isMapSelected = selectedHomeId === home.homeId;
              const status = statuses[home.homeId] || "neutral";
              return (
                <motion.div
                  key={home.homeId}
                  ref={(el) => { cardRefs.current[home.homeId] = el; }}
                  layout
                  initial={{ opacity: 0, y: 40, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className={`bg-card rounded-2xl homescope-card-shadow overflow-hidden transition-all duration-300 cursor-pointer hover:translate-y-[-2px] hover:shadow-lg ${rank === 1 ? "ring-2 ring-accent/50" : ""
                      } ${isMapSelected ? "ring-2 ring-primary" : ""} ${status === "disliked" ? "opacity-60" : ""}`}
                    onClick={() => setSelectedHomeId(selectedHomeId === home.homeId ? null : home.homeId)}
                  >
                    <div className="p-5 flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${rankBadgeStyle(rank)}`}>
                        {rank === 1 ? <Trophy className="h-5 w-5" /> : `#${rank}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{home.address}</p>

                        {/* Mode comparison row */}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                          {(["transit", "driving", "walking"] as TravelMode[]).map((mode) => {
                            const stats = home.perModeStats[mode];
                            if (!stats || stats.avgMinutes === 0) return null;
                            return (
                              <span key={mode} className="flex items-center gap-0.5">
                                {modeEmoji(mode)} {stats.avgMinutes}m
                              </span>
                            );
                          })}
                        </div>

                        {/* Rent + avg commute */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">£{home.rentMonthlyGBP}/mo</span>
                          <span className="flex items-center gap-1 text-primary font-medium">
                            <Clock className="h-3 w-3" /> {home.blendedCommuteMinutes} min avg
                          </span>
                        </div>

                        {/* Badges */}
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${variabilityBadgeColor(home.variabilityLabel)}`}>
                            {home.variabilityLabel}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${robustnessBadgeColor(home.robustnessLabel)}`}>
                            {home.robustnessLabel}
                          </span>
                        </div>
                      </div>
                      <div className="text-center shrink-0">
                        <motion.div key={home.totalScore} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={`text-3xl font-bold ${scoreColor(home.totalScore)}`}>
                          {home.totalScore}
                        </motion.div>
                        <div className="text-sm">{scoreEmoji(home.totalScore)}</div>
                      </div>
                    </div>

                    {/* Selected home place breakdown */}
                    <AnimatePresence>
                      {isMapSelected && home.perPlaceBreakdown.length > 0 && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                          <div className="px-5 pb-3 border-t border-border pt-3 space-y-1.5">
                            {home.perPlaceBreakdown.map((pt) => (
                              <div key={pt.placeId} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />{pt.placeName}
                                </span>
                                <span className="text-foreground font-medium">{pt.blendedMinutes} min</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="px-5 pb-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => updateStatus(home.homeId, "liked")}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${status === "liked" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10"
                          }`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${status === "liked" ? "fill-primary" : ""}`} /> Like
                      </button>
                      <button
                        onClick={() => updateStatus(home.homeId, "disliked")}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${status === "disliked" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          }`}
                      >
                        <ThumbsDown className={`h-3.5 w-3.5 ${status === "disliked" ? "fill-destructive" : ""}`} /> Dislike
                      </button>
                      <button
                        onClick={() => setDetailId(home.homeId)}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View details <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {scores.length === 0 && hasRoutes && (
            <p className="text-center text-muted-foreground py-6 text-sm">No scored homes available. Check your addresses.</p>
          )}
          {!hasRoutes && (
            <p className="text-center text-muted-foreground py-6 text-sm">No route data yet. Go back and run Calculate Results.</p>
          )}
        </div>

        {/* Bottom actions */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3">
            <SecondaryButton onClick={onBack}>← Back</SecondaryButton>
            <PrimaryButton onClick={handleSave} className="flex-1">
              <Save className="h-4 w-4 mr-2" /> Save this scenario
            </PrimaryButton>
          </div>
          <div className="flex gap-3">
            {onGoToLibrary && (
              <SecondaryButton onClick={onGoToLibrary} className="flex-1">
                <FolderOpen className="h-4 w-4 mr-2" /> View all scenarios
              </SecondaryButton>
            )}
            <SecondaryButton onClick={onRestart} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" /> New comparison
            </SecondaryButton>
          </div>
        </motion.div>
      </div>

      {/* Right: Interactive Map */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="flex-1 w-full lg:max-w-lg lg:sticky lg:top-28 space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Click a home to highlight on map.</p>
          <button onClick={() => setMapExpanded(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary bg-card rounded-xl homescope-card-shadow transition-colors">
            <Maximize2 className="h-3.5 w-3.5" /> Expand
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { label: "Homes", icon: Home, value: showHomes, set: setShowHomes },
            { label: "Places", icon: MapPin, value: showPlaces, set: setShowPlaces },
          ].map((toggle) => (
            <label key={toggle.label} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card rounded-xl homescope-card-shadow cursor-pointer select-none text-xs">
              <toggle.icon className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">{toggle.label}</span>
              <Switch checked={toggle.value} onCheckedChange={toggle.set} className="scale-75" />
            </label>
          ))}
        </div>

        {renderMap("h-[560px]")}

        {/* Selected home info */}
        <AnimatePresence mode="wait">
          {selectedHome && (
            <motion.div key={selectedHome.homeId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }} className="bg-card rounded-xl homescope-card-shadow p-4 overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg homescope-gradient-green flex items-center justify-center text-xs">🏠</div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{selectedHome.address}</p>
                  <p className="text-xs text-muted-foreground">£{selectedHome.rentMonthlyGBP}/mo · {selectedHome.blendedCommuteMinutes} min avg</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {selectedHome.perPlaceBreakdown.map((pt) => (
                  <div key={pt.placeId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3 w-3" />{pt.placeName}</span>
                    <span className="text-foreground font-medium">{pt.blendedMinutes} min</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex justify-end pt-2">
          <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-primary bg-card rounded-xl homescope-card-shadow transition-colors">
            <HelpCircle className="h-4 w-4" /> Help & Tips
          </button>
        </motion.div>
      </motion.div>

      {/* Map Expanded Modal */}
      <Dialog open={mapExpanded} onOpenChange={setMapExpanded}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] p-6">
          <DialogHeader>
            <DialogTitle className="font-serif">Interactive Map</DialogTitle>
            <DialogDescription>Explore routes between your homes and places.</DialogDescription>
          </DialogHeader>
          {renderMap("h-[70vh]")}
        </DialogContent>
      </Dialog>

      {/* Help Modal */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Help & <span className="text-primary">Understanding</span></DialogTitle>
            <DialogDescription>Everything you need to make a confident decision.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {helpSections.map((section) => (
              <AnimatedCard key={section.title} className="p-4">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-homescope-green-light flex items-center justify-center shrink-0">
                    <section.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">{section.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{section.body}</p>
                  </div>
                </div>
              </AnimatedCard>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResultsStep;
