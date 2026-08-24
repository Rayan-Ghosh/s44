import { SecurityAlert } from "../types/alert";

export const INITIAL_ALERTS: SecurityAlert[] = [
  {
    id: "alert-1",
    category: "payment",
    severity: "HIGH",
    title: "Suspicious payment intercepted",
    description: "₹49,000 to newmerchant@upi was held for verification",
    amount: "₹49,000",
    timestamp: "2 min ago",
    isRead: false,
    metadata: {
      recipient: "newmerchant@upi",
      riskScore: 88,
    },
    whatHappened: "A high-value payment of ₹49,000 was initiated to an unrecognized UPI handle from a device not on your regular trusted list.",
    whyFlagged: [
      "Amount is 12x above your 30-day average transfer size",
      "Recipient UPI handle has never interacted with your account",
      "Transaction was preceded by an active social engineering call",
      "Device fingerprint is unverified",
    ],
    whatYouShouldDo: [
      "Review the transaction details carefully in the Payments tab",
      "If you did not initiate this or were pressured on a phone call, tap Cancel or Report",
      "Do not authorize any UPI PIN request prompted by a caller",
    ],
  },
  {
    id: "alert-2",
    category: "voice",
    severity: "HIGH",
    title: "Possible voice scam detected",
    description: "Incoming call from +91 1800 209 8888 attempted OTP & AnyDesk coercion",
    timestamp: "Today · 8:39 PM",
    isRead: false,
    metadata: {
      callerNumber: "+91 1800 209 8888",
      riskScore: 91,
    },
    whatHappened: "A caller impersonating cyber police attempted to coerce you into installing AnyDesk and reading out SMS OTP codes.",
    whyFlagged: [
      "Linguistic markers matched known tech-support / police impersonation scripts",
      "Remote desktop tool solicitation detected",
      "OTP extraction phrasing detected with high confidence (91/100)",
    ],
    whatYouShouldDo: [
      "Never share OTPs with any caller under any circumstances",
      "Uninstall any remote desktop apps installed during this call",
      "Block the scammer number",
    ],
  },
  {
    id: "alert-3",
    category: "device",
    severity: "MEDIUM",
    title: "Unusual device activity",
    description: "New Android device fingerprint logged in New Delhi",
    timestamp: "Yesterday · 4:15 PM",
    isRead: true,
    metadata: {
      device: "OnePlus 11",
      riskScore: 52,
    },
    whatHappened: "A login attempt was registered from a device identifier that has not completed primary biometric enrollment.",
    whyFlagged: [
      "First login from this hardware ID",
      "Location differs from regular home geofence",
    ],
    whatYouShouldDo: [
      "Confirm if this device belongs to you in Settings > Trusted Devices",
      "Revoke access immediately if you do not recognize it",
    ],
  },
];

export class AlertsService {
  static getAlerts(): SecurityAlert[] {
    return [...INITIAL_ALERTS];
  }
}
