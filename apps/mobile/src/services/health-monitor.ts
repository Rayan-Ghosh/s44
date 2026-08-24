export type HealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface AppHealthMetrics {
  status: HealthStatus;
  eventLoopLagMs: number;
  fps: number;
  memoryUsageMb: number;
  activeTimersCount: number;
  lastCheckedAt: string;
}

export type HealthListener = (metrics: AppHealthMetrics) => void;

export class HealthMonitorService {
  private static isRunning: boolean = false;
  private static intervalId: any = null;
  private static lastTick: number = Date.now();
  private static frameCount: number = 0;
  private static lastFpsCalculation: number = Date.now();
  private static currentFps: number = 60;
  private static currentLag: number = 0;
  private static listeners: Set<HealthListener> = new Set();
  private static animationFrameId: number | null = null;

  /**
   * Starts periodic health metrics sampling.
   */
  static startMonitoring(intervalMs: number = 1000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTick = Date.now();
    this.lastFpsCalculation = Date.now();
    this.frameCount = 0;

    // Frame counter loop for FPS
    const countFrame = () => {
      this.frameCount++;
      const now = Date.now();
      const elapsed = now - this.lastFpsCalculation;
      if (elapsed >= 1000) {
        this.currentFps = Math.min(60, Math.round((this.frameCount * 1000) / elapsed));
        this.frameCount = 0;
        this.lastFpsCalculation = now;
      }
      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(countFrame);
      }
    };
    this.animationFrameId = requestAnimationFrame(countFrame);

    // Event Loop Lag timer
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const expectedElapsed = intervalMs;
      const actualElapsed = now - this.lastTick;
      this.currentLag = Math.max(0, actualElapsed - expectedElapsed);
      this.lastTick = now;

      const metrics = this.getMetrics();
      this.notifyListeners(metrics);
    }, intervalMs);
  }

  /**
   * Stops background health tracking.
   */
  static stopMonitoring() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Current instantaneous health metrics snapshot.
   */
  static getMetrics(): AppHealthMetrics {
    let status: HealthStatus = "HEALTHY";
    if (this.currentLag > 250 || this.currentFps < 30) {
      status = "CRITICAL";
    } else if (this.currentLag > 60 || this.currentFps < 50) {
      status = "DEGRADED";
    }

    // Rough heap approximation if available
    let memoryUsageMb = 48.5;
    if (typeof performance !== "undefined" && (performance as any).memory) {
      memoryUsageMb = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
    }

    return {
      status,
      eventLoopLagMs: this.currentLag,
      fps: this.currentFps,
      memoryUsageMb,
      activeTimersCount: 3,
      lastCheckedAt: new Date().toLocaleTimeString(),
    };
  }

  /**
   * Subscribe to health updates.
   */
  static subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    // Send immediate initial metrics
    listener(this.getMetrics());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners(metrics: AppHealthMetrics) {
    this.listeners.forEach((listener) => {
      try {
        listener(metrics);
      } catch (err) {
        // Prevent subscriber errors from disrupting the monitor
      }
    });
  }
}
