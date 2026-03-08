import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const AnimatedCard = ({ children, className = "", delay = 0 }: AnimatedCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`bg-card rounded-2xl homescope-card-shadow p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
};

interface WizardStepProps {
  children: ReactNode;
  direction?: number;
}

const WizardStep = ({ children, direction = 1 }: WizardStepProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: direction * 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: direction * -60 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
};

interface WizardContainerProps {
  children: ReactNode;
  stepKey: number;
  direction: number;
}

const WizardContainer = ({ children, stepKey, direction }: WizardContainerProps) => {
  return (
    <div className="relative w-full min-h-[calc(100vh-120px)] flex items-center">
      <AnimatePresence mode="wait" custom={direction}>
        <WizardStep key={stepKey} direction={direction}>
          {children}
        </WizardStep>
      </AnimatePresence>
    </div>
  );
};

export { AnimatedCard, WizardStep, WizardContainer };
