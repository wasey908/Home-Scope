import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  steps: string[];
  currentStep: number;
}

const ProgressIndicator = ({ steps, currentStep }: ProgressIndicatorProps) => {
  // Progress width: fill exactly to the active dot position
  const progressPercent = steps.length > 1
    ? (currentStep / (steps.length - 1)) * 100
    : 0;

  return (
    <div className="w-full px-4 py-4">
      <div className="mx-auto max-w-3xl">
        {/* Step labels - hidden on small screens */}
        <div className="hidden sm:flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className={cn(
                "text-xs font-medium transition-colors duration-300 text-center flex-1",
                index <= currentStep
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {step}
            </span>
          ))}
        </div>

        {/* Mobile current step */}
        <div className="sm:hidden text-center mb-2">
          <span className="text-sm font-medium text-primary">
            {steps[currentStep]}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {currentStep + 1} / {steps.length}
          </span>
        </div>

        {/* Progress bar + dots container */}
        <div className="relative">
          {/* Track */}
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full homescope-gradient-green rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Dots — positioned on top of track, evenly spaced */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-3 h-3 rounded-full border-2 transition-all duration-500",
                  index <= currentStep
                    ? "bg-primary border-primary scale-110"
                    : "bg-card border-border"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;
