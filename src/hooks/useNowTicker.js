import { useEffect, useState } from "react";

export function useNowTicker(runningCount) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!runningCount) return undefined;
    const interval = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, [runningCount]);

  return tick;
}
