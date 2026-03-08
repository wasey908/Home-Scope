import { motion } from "framer-motion";
import { PrimaryButton, SecondaryButton } from "@/components/HomescopeButtons";
import heroHouse from "@/assets/hero-house.png";

interface WelcomeStepProps {
  onNext: () => void;
  onGuest?: () => void;
}

const WelcomeStep = ({ onNext, onGuest }: WelcomeStepProps) => {
  return (
    <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-20 px-6 max-w-6xl mx-auto w-full">
      {/* Illustration Side */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex-1 max-w-xl order-2 lg:order-1"
      >
        <motion.img
          src={heroHouse}
          alt="Illustrated houses blending city and countryside"
          className="w-full h-auto rounded-2xl"
          animate={{ y: [0, -10, 0], rotate: [0, 0.5, -0.5, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Text Side */}
      <div className="flex-1 text-center lg:text-left space-y-5 order-1 lg:order-2">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-4xl sm:text-5xl lg:text-[3.4rem] font-serif font-bold text-foreground leading-tight"
        >
          Find a home that fits{" "}
          <span className="text-primary">your life</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-xl text-muted-foreground font-medium"
        >
          Not just rent. Not just distance.
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6 }}
          className="text-base text-muted-foreground max-w-md mx-auto lg:mx-0"
        >
          HomeScope compares homes based on how you actually live.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="flex flex-col sm:flex-row gap-3 pt-3 justify-center lg:justify-start"
        >
          <PrimaryButton size="lg" onClick={onNext}>
            Start planning →
          </PrimaryButton>
          {onGuest && (
            <SecondaryButton size="lg" onClick={onGuest}>
              Continue as guest
            </SecondaryButton>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default WelcomeStep;
