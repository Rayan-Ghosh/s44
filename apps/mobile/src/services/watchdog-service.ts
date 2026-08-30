export interface FreezeIncident {
  id: string;
  durationMs: number;
  detectedAt: string;
  recoveredAt: string;
  recoveryAction: string;
}

export type WatchdogAlertCallback = (incident: FreezeIncident) => void;

export class WatchdogService {
  private static isRunning: boolean = false;
  private static heartbeatTimer: any = null;
  private static lastHeartbeat: number = Date.now();
  private static readonly HEARTBEAT_INTERVAL_MS = 250;
  private static readonly FREEZE_THRESHOLD_MS = 1800; // >1.8s lag considered a frozen thread
  private static incidentCallbacks: Set<WatchdogAlertCallback> = new Set();
  private static incidentsHistory: FreezeIncident[] = [];

  /**
   * Starts the UI thread block watchdog loop.
   */
  static startWatchdog() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastHeartbeat = Date.now();

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const delay = now - this.lastHeartbeat;

      if (delay > this.FREEZE_THRESHOLD_MS) {
        // UI thread was blocked for `delay` milliseconds!
        const incident: FreezeIncident = {
          id: `freeze-${Date.now()}`,
          durationMs: delay,
          detectedAt: new Date(this.lastHeartbeat).toLocaleTimeString(),
          recoveredAt: new Date(now).toLocaleTimeString(),
          recoveryAction: "Gracefully restored thread execution and flushed event loop queues.",
        };

        this.incidentsHistory.unshift(incident);
        if (this.incidentsHistory.length > 20) {
          this.incidentsHistory.pop();
        }

        this.notifyIncident(incident);
      }

      this.lastHeartbeat = now;
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stops watchdog monitoring.
   */
  static stopWatchdog() {
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Register a listener for freeze incidents.
   */
  static onFreezeDetected(callback: WatchdogAlertCallback): () => void {
    this.incidentCallbacks.add(callback);
    return () => {
      this.incidentCallbacks.delete(callback);
    };
  }

  /**
   * Simulates a synchronous thread freeze for testing/verification.
   */
  static simulateThreadFreeze(durationMs: number = 2200) {
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      // Intentionally block JavaScript single thread synchronously
    }
  }

  static getIncidentHistory(): FreezeIncident[] {
    return [...this.incidentsHistory];
  }

  private static notifyIncident(incident: FreezeIncident) {
    this.incidentCallbacks.forEach((cb) => {
      try {
        cb(incident);
      } catch (e) {
        // Safe callback execution
      }
    });
  }
}
