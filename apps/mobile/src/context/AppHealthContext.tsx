import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { HealthMonitorService, AppHealthMetrics } from "../services/health-monitor";
import { WatchdogService, FreezeIncident } from "../services/watchdog-service";

interface AppHealthContextType {
  metrics: AppHealthMetrics;
  recentFreezeIncident: FreezeIncident | null;
  dismissFreezeAlert: () => void;
  simulateFreeze: (durationMs?: number) => void;
  incidentsHistory: FreezeIncident[];
}

const DEFAULT_METRICS: AppHealthMetrics = {
  status: "HEALTHY",
  eventLoopLagMs: 0,
  fps: 60,
  memoryUsageMb: 48,
  activeTimersCount: 3,
  lastCheckedAt: "Just now",
};

const AppHealthContext = createContext<AppHealthContextType | undefined>(undefined);

export const AppHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<AppHealthMetrics>(DEFAULT_METRICS);
  const [recentFreezeIncident, setRecentFreezeIncident] = useState<FreezeIncident | null>(null);
  const [incidentsHistory, setIncidentsHistory] = useState<FreezeIncident[]>([]);

  useEffect(() => {
    // Start health monitor & watchdog
    HealthMonitorService.startMonitoring(1000);
    WatchdogService.startWatchdog();

    const unsubscribeHealth = HealthMonitorService.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });

    const unsubscribeWatchdog = WatchdogService.onFreezeDetected((incident) => {
      setRecentFreezeIncident(incident);
      setIncidentsHistory(WatchdogService.getIncidentHistory());
    });

    return () => {
      unsubscribeHealth();
      unsubscribeWatchdog();
      HealthMonitorService.stopMonitoring();
      WatchdogService.stopWatchdog();
    };
  }, []);

  const dismissFreezeAlert = useCallback(() => {
    setRecentFreezeIncident(null);
  }, []);

  const simulateFreeze = useCallback((durationMs: number = 2200) => {
    setTimeout(() => {
      WatchdogService.simulateThreadFreeze(durationMs);
    }, 100);
  }, []);

  return (
    <AppHealthContext.Provider
      value={{
        metrics,
        recentFreezeIncident,
        dismissFreezeAlert,
        simulateFreeze,
        incidentsHistory,
      }}
    >
      {children}
    </AppHealthContext.Provider>
  );
};

export const useAppHealth = (): AppHealthContextType => {
  const context = useContext(AppHealthContext);
  if (!context) {
    throw new Error("useAppHealth must be used within an AppHealthProvider");
  }
  return context;
};
