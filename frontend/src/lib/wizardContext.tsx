import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { type RoutingSettings, type RouteResult, type HomeScore, DEFAULT_ROUTING_SETTINGS } from "./routingTypes";

export interface PlaceEntry {
  name: string;
  address: string;
  importance: number;
}

export interface HomeEntry {
  address: string;
  rent: string;
}

export interface TravelPrefs {
  selectedTimes: string[];
  changesPreference: number;
  walkingPreference: number;
  learnPreferences: boolean;
  preferReliable: boolean;
}

interface WizardData {
  places: PlaceEntry[];
  homes: HomeEntry[];
  travel: TravelPrefs;
  routingSettings: RoutingSettings;
  routes: RouteResult[];
  scores: HomeScore[];
  routesStale: boolean;
  failedRouteCount: number;
  homeStatuses: Record<number, "neutral" | "liked" | "disliked">;
}

interface WizardContextType {
  data: WizardData;
  setPlaces: (places: PlaceEntry[]) => void;
  setHomes: (homes: HomeEntry[]) => void;
  setTravel: (travel: TravelPrefs) => void;
  setRoutingSettings: (settings: RoutingSettings) => void;
  setRoutes: (routes: RouteResult[]) => void;
  setScores: (scores: HomeScore[]) => void;
  setFailedRouteCount: (count: number) => void;
  markRoutesStale: () => void;
  markRoutesFresh: () => void;
  resetAll: () => void;
  loadScenarioData: (inputs: {
    places?: PlaceEntry[];
    homes?: HomeEntry[];
    travel?: TravelPrefs;
    routingSettings?: RoutingSettings;
    routes?: RouteResult[];
    scores?: HomeScore[];
    homeStatuses?: Record<number, "neutral" | "liked" | "disliked">;
  }) => void;
}

const defaultTravel: TravelPrefs = {
  selectedTimes: ["morning", "evening"],
  changesPreference: 50,
  walkingPreference: 50,
  learnPreferences: false,
  preferReliable: true,
};

const defaultData: WizardData = {
  places: [],
  homes: [],
  travel: defaultTravel,
  routingSettings: DEFAULT_ROUTING_SETTINGS,
  routes: [],
  scores: [],
  routesStale: false,
  failedRouteCount: 0,
  homeStatuses: {},
};

const WizardContext = createContext<WizardContextType | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WizardData>(defaultData);

  const setPlaces = useCallback((places: PlaceEntry[]) => {
    setData((prev) => ({ ...prev, places, routesStale: prev.routes.length > 0 }));
  }, []);

  const setHomes = useCallback((homes: HomeEntry[]) => {
    setData((prev) => ({ ...prev, homes, routesStale: prev.routes.length > 0 }));
  }, []);

  const setTravel = useCallback((travel: TravelPrefs) => {
    setData((prev) => ({ ...prev, travel }));
  }, []);

  const setRoutingSettings = useCallback((routingSettings: RoutingSettings) => {
    setData((prev) => ({ ...prev, routingSettings }));
  }, []);

  const setRoutes = useCallback((routes: RouteResult[]) => {
    setData((prev) => ({ ...prev, routes, routesStale: false }));
  }, []);

  const setScores = useCallback((scores: HomeScore[]) => {
    setData((prev) => ({ ...prev, scores }));
  }, []);

  const setFailedRouteCount = useCallback((failedRouteCount: number) => {
    setData((prev) => ({ ...prev, failedRouteCount }));
  }, []);

  const markRoutesStale = useCallback(() => {
    setData((prev) => ({ ...prev, routesStale: true }));
  }, []);

  const markRoutesFresh = useCallback(() => {
    setData((prev) => ({ ...prev, routesStale: false }));
  }, []);

  const resetAll = useCallback(() => {
    setData(defaultData);
  }, []);

  const loadScenarioData = useCallback((inputs: {
    places?: PlaceEntry[];
    homes?: HomeEntry[];
    travel?: TravelPrefs;
    routingSettings?: RoutingSettings;
    routes?: RouteResult[];
    scores?: HomeScore[];
    homeStatuses?: Record<number, "neutral" | "liked" | "disliked">;
  }) => {
    setData({
      ...defaultData,
      places: inputs.places || [],
      homes: inputs.homes || [],
      travel: inputs.travel || defaultTravel,
      routingSettings: inputs.routingSettings || DEFAULT_ROUTING_SETTINGS,
      routes: inputs.routes || [],
      scores: inputs.scores || [],
      homeStatuses: inputs.homeStatuses || {},
    });
  }, []);

  return (
    <WizardContext.Provider value={{
      data, setPlaces, setHomes, setTravel, setRoutingSettings,
      setRoutes, setScores, setFailedRouteCount, markRoutesStale, markRoutesFresh, resetAll, loadScenarioData,
    }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizardData() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizardData must be used within WizardProvider");
  return ctx;
}
