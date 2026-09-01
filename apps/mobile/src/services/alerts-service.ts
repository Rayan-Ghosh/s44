import { SecurityAlert, AlertCategory } from "../types/alert";
import { AlertService } from "./alert-service";

export class AlertsService {
  static async getAlerts(userId?: number): Promise<SecurityAlert[]> {
    const raw = await AlertService.getAlerts();
    return raw.map((a) => ({
      id: a.id,
      category: a.category || "payment",
      severity: a.severity,
      title: a.title,
      description: a.description,
      timestamp: a.timestamp,
      isRead: a.isRead,
      metadata: { transactionId: a.transactionId },
      whatHappened: a.whatHappened || a.description,
      whyFlagged: a.whyFlagged || [a.description],
      whatYouShouldDo: a.whatYouShouldDo || ["Review transaction details"],
    }));
  }

  static addAlert(alert: SecurityAlert) {
    AlertService.addAlert({
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      status: alert.isRead ? "RESOLVED" : "ACTIVE",
      timestamp: alert.timestamp,
      transactionId: alert.metadata?.transactionId,
      isRead: alert.isRead,
      category: alert.category,
      whatHappened: alert.whatHappened,
      whyFlagged: alert.whyFlagged,
      whatYouShouldDo: alert.whatYouShouldDo,
    });
  }

  static markAsRead(alertId: string) {
    AlertService.markAsRead(alertId);
  }
}
