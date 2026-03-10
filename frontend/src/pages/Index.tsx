import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WizardContainer } from "@/components/WizardComponents";
import ProgressIndicator from "@/components/ProgressIndicator";
import WelcomeStep from "@/components/steps/WelcomeStep";
import PlacesStep from "@/components/steps/PlacesStep";
import HomesStep from "@/components/steps/HomesStep";
import TravelStep from "@/components/steps/TravelStep";
import CalculatingStep from "@/components/steps/CalculatingStep";
import ResultsStep from "@/components/steps/ResultsStep";
import ScenarioLibrary from "@/components/ScenarioLibrary";
import AuthModal from "@/components/AuthModal";
import { getSession, logout as mockLogout } from "@/lib/mockAuth";
import type { MockUser } from "@/lib/mockAuth";
import { getAllScenarios, getScenario, createScenario, updateScenario, type ScenarioData } from "@/lib/scenarios";
import { useWizardData } from "@/lib/wizardContext";
import { User, LogOut, FolderOpen, ChevronDown } from "lucide-react";


const STEPS = ["Welcome", "Places", "Homes", "Travel", "Calculating", "Results"];

type AppView = "library" | "wizard";

// localStorage-based login helpers
function getStoredUser(): { name: string; loggedIn: boolean } | null {
  try {
    const raw = localStorage.getItem("homeScopeUser");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.loggedIn ? parsed : null;
  } catch {
    return null;
  }
}

function storeUser(email: string) {
  const name = email.split("@")[0] || "User";
  localStorage.setItem("homeScopeUser", JSON.stringify({ name, email, loggedIn: true }));
}

function clearStoredUser() {
  localStorage.removeItem("homeScopeUser");
}

const Index = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [user, setUser] = useState<MockUser | null>(getSession);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getStoredUser());
  const [storedUserName, setStoredUserName] = useState(() => getStoredUser()?.name || "");
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<AppView>("wizard");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pendingSaveAfterAuth, setPendingSaveAfterAuth] = useState(false);
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { resetAll: resetWizard, loadScenarioData, data: wizardData } = useWizardData();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // On load: if scenarios exist, show library
  useEffect(() => {
    const checkScenarios = async () => {
      const scenarios = await getAllScenarios();
      if (scenarios.length > 0) {
        setView("library");
      }
    };
    checkScenarios();
  }, []);

  const goTo = useCallback((step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  }, [currentStep]);

  const next = useCallback(() => goTo(currentStep + 1), [goTo, currentStep]);
  const back = useCallback(() => goTo(currentStep - 1), [goTo, currentStep]);
  const restart = useCallback(() => {
    setDirection(-1);
    setCurrentStep(0);
    setActiveScenarioId(null);
    resetWizard();
  }, [resetWizard]);

  const handleStartPlanning = async () => {
    if (isLoggedIn) {
      // Already logged in, skip auth modal
      const scenarios = await getAllScenarios();
      if (scenarios.length > 0) {
        setView("library");
      } else {
        next();
      }
    } else {
      setAuthOpen(true);
    }
  };

  const handleAuth = async (u: MockUser) => {
    setUser(u);
    setAuthOpen(false);
    storeUser(u.email);
    setIsLoggedIn(true);
    setStoredUserName(u.email.split("@")[0] || "User");

    const newTrigger = Date.now();
    setLibraryRefreshTrigger(newTrigger);

    // If user was trying to save as a guest, stay on the results page
    if (pendingSaveAfterAuth) {
      setPendingSaveAfterAuth(false);
      return; // Stay on results, user can now click Save again and the name modal will appear
    }

    const scenarios = await getAllScenarios();
    if (scenarios.length > 0) {
      setView("library");
    } else {
      next();
    }
  };

  const handleGuest = () => {
    setAuthOpen(false);
    // Clear any leftover wizard data from previous sessions
    resetWizard();
    localStorage.removeItem("homescope_draft_homes");
    next();
  };

  const handleLogout = () => {
    mockLogout();
    clearStoredUser();
    setUser(null);
    setIsLoggedIn(false);
    setStoredUserName("");
    setDropdownOpen(false);

    // Clear all wizard data so next user doesn't see previous user's data
    resetWizard();
    localStorage.removeItem("homescope_draft_homes");

    // Return to landing page
    setCurrentStep(0);
    setView("wizard");
    setActiveScenarioId(null);
  };

  const handleOpenScenario = async (scenario: ScenarioData) => {
    setActiveScenarioId(scenario.id);

    // Load the saved scenario's places/homes/travel into the wizard context
    const freshScenario = await getScenario(scenario.id);
    const s = freshScenario || scenario;
    const inputs = s.wizardInputs;

    // Extract persisted routes, scores, and routingSettings from results blob
    const savedResults = s.results as any || {};
    const savedRoutes = savedResults.routes || [];
    const savedScores = savedResults.scores || [];
    const savedRoutingSettings = inputs.routingSettings || savedResults.routingSettings || undefined;

    loadScenarioData({
      places: inputs.places || [],
      homes: inputs.homes || [],
      travel: inputs.travel,
      routingSettings: savedRoutingSettings,
      routes: savedRoutes,
      scores: savedScores,
    });

    const resumeStep = Math.min(s.lastCompletedStep, STEPS.length - 1);
    setDirection(1);
    setCurrentStep(resumeStep > 0 ? resumeStep : 1);
    setView("wizard");
  };

  const handleNewScenario = async () => {
    // Reset wizard data so the new scenario starts fresh
    resetWizard();
    localStorage.removeItem("homescope_draft_homes");

    const s = await createScenario();
    setActiveScenarioId(s.id);
    setDirection(1);
    setCurrentStep(1);
    setView("wizard");
  };

  const showLibrary = () => {
    setView("library");
  };

  const handleSaveAndLibrary = () => {
    setView("library");
  };

  // Track step completion on the active scenario (only driven by explicit step navigation)
  useEffect(() => {
    if (activeScenarioId && currentStep > 0) {
      updateScenario(activeScenarioId, { lastCompletedStep: currentStep });
    }
  }, [activeScenarioId, currentStep]);

  // Explicit save of wizard inputs — called when user clicks Next on steps 1,2,3
  const saveWizardInputs = useCallback(() => {
    if (activeScenarioId && wizardData.places.length + wizardData.homes.length > 0) {
      updateScenario(activeScenarioId, {
        wizardInputs: {
          places: wizardData.places,
          homes: wizardData.homes,
          travel: wizardData.travel,
          routingSettings: wizardData.routingSettings,
        },
      });
    }
  }, [activeScenarioId, wizardData.places, wizardData.homes, wizardData.travel, wizardData.routingSettings]);

  const renderStep = () => {
    const savedNext = () => { saveWizardInputs(); next(); };
    switch (currentStep) {
      case 0: return <WelcomeStep onNext={handleStartPlanning} onGuest={isLoggedIn ? undefined : () => { next(); }} />;
      case 1: return <PlacesStep onNext={savedNext} onBack={back} />;
      case 2: return <HomesStep onNext={savedNext} onBack={back} />;
      case 3: return <TravelStep onNext={savedNext} onBack={back} />;
      case 4: return <CalculatingStep onNext={next} onBack={() => goTo(3)} />;
      case 5: return (
        <ResultsStep
          onBack={() => goTo(3)}
          onRestart={restart}
          scenarioId={activeScenarioId}
          onGoToLibrary={handleSaveAndLibrary}
          isLoggedIn={isLoggedIn}
          onRequestAuth={() => {
            setPendingSaveAfterAuth(true);
            setAuthOpen(true);
          }}
        />
      );
      default: return <WelcomeStep onNext={handleStartPlanning} onGuest={isLoggedIn ? undefined : () => { next(); }} />;
    }
  };

  const userInitial = storedUserName ? storedUserName.charAt(0).toUpperCase() : "U";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1
            className="text-xl font-serif font-bold text-foreground cursor-pointer"
            onClick={async () => {
              const scenarios = await getAllScenarios();
              if (scenarios.length > 0) setView("library");
            }}
          >
            Home<span className="text-primary">Scope</span>
          </h1>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">Find Where Life Fits</span>

            <button
              onClick={showLibrary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-homescope-green-light rounded-full transition-colors"
              title="My Scenarios"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">My Scenarios</span>
            </button>

            {isLoggedIn ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-homescope-green-light rounded-full transition-colors hover:bg-primary/15"
                >
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">{userInitial}</span>
                  </div>
                  <ChevronDown className={`h-3.5 w-3.5 text-primary transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-48 bg-card rounded-xl homescope-card-shadow border border-border overflow-hidden z-50"
                    >
                      <button
                        onClick={() => { setDropdownOpen(false); showLibrary(); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                      >
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        My Scenarios
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-secondary transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Log out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="px-3 py-1.5 text-xs font-medium text-primary hover:bg-homescope-green-light rounded-full transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
        {view === "wizard" && <ProgressIndicator steps={STEPS} currentStep={currentStep} />}
      </header>

      {/* Content */}
      <main className="flex-1 py-8">
        {view === "library" ? (
          <ScenarioLibrary
            onOpenScenario={handleOpenScenario}
            onNewScenario={handleNewScenario}
            refreshTrigger={libraryRefreshTrigger}
          />
        ) : (
          <WizardContainer stepKey={currentStep} direction={direction}>
            {renderStep()}
          </WizardContainer>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuth={handleAuth}
        onGuest={handleGuest}
        hideGuest={isLoggedIn}
      />
    </div>
  );
};

export default Index;
