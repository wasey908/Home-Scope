import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import { X, Mail, Lock } from "lucide-react";
import { login, register } from "@/lib/mockAuth";
import type { MockUser } from "@/lib/mockAuth";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: (user: MockUser) => void;
  onGuest: () => void;
  hideGuest?: boolean;
}

const AuthModal = ({ open, onClose, onAuth, onGuest, hideGuest }: AuthModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (mode: "login" | "register") => {
    setError("");

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const result = mode === "login" ? await login(email, password) : await register(email, password);
      setLoading(false);
      if (result.ok === true) {
        setEmail("");
        setPassword("");
        onAuth(result.user);
      } else {
        setError(result.error);
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "An error occurred.");
    }
  };

  const handleGuest = () => {
    setEmail("");
    setPassword("");
    setError("");
    onGuest();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-sm bg-card rounded-2xl homescope-card-shadow p-8 space-y-5"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-1.5">
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Save your plans
              </h2>
              <p className="text-sm text-muted-foreground">
                Create an account to come back anytime
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="Email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Password"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit("login")}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-destructive text-center"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="space-y-2.5">
              <div className="flex gap-2">
                <PrimaryButton
                  onClick={() => handleSubmit("login")}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "..." : "Log in"}
                </PrimaryButton>
                <PrimaryButton
                  variant="accent"
                  onClick={() => handleSubmit("register")}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "..." : "Create account"}
                </PrimaryButton>
              </div>

              {!hideGuest && (
                <SecondaryButton onClick={handleGuest} className="w-full">
                  Continue without account
                </SecondaryButton>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
