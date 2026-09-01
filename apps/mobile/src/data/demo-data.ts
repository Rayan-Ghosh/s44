import { UserTransaction, UserPaymentOverview } from "../services/payment-service";
import { SecurityAlert } from "../types/alert";
import { TrustedContact } from "../types/guardian";
import { UserSession } from "../services/auth-service";
import { getRiskLevelFromScore } from "../utils/risk-scoring";

export const DEMO_USER_SESSION: UserSession = {
  isAuthenticated: true,
  userId: 1,
  name: "Rahul Sharma",
  email: "rahul@example.com",
  phone: "+91 98765 43210",
  memberSince: "August 2025",
  token: "usr_tok_avaran_demo_session",
};

export const DEMO_TRUSTED_CONTACTS: TrustedContact[] = [
  {
    id: "1",
    name: "Priya Sharma",
    phone: "+91 98765 11111",
    relationship: "Spouse (Primary Guardian)",
    addedAt: "10 Aug 2025",
  },
  {
    id: "2",
    name: "Amit Sharma",
    phone: "+91 98765 22222",
    relationship: "Brother",
    addedAt: "15 Aug 2025",
  },
];

export const DEMO_USER_TRANSACTIONS: UserTransaction[] = [
  // ── Requested demo transactions ─────────────────────────────────────────────
  {
    id: "1",
    title: "Amazon India",
    merchant: "Amazon India",
    amount: 2499,
    date: "Today · 10:32 AM",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    paymentMethod: "Amazon Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(5.2),
    riskScore: 5.2,
    isCompleted: true,
    paymentAppUsed: "Amazon Pay",
    completionTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    riskFactors: [],
    reasons: [
      "Verified e-commerce gateway",
      "Consistent with your purchase history",
    ],
    trustedApproval: { required: false },
  },
  {
    id: "2",
    title: "Swiggy Food Delivery",
    merchant: "Swiggy",
    amount: 650,
    date: "Yesterday",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(3.8),
    riskScore: 3.8,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000).toISOString(),
    riskFactors: [],
    reasons: [
      "Verified merchant with frequent past transactions",
      "Device and location match home baseline",
    ],
    trustedApproval: { required: false },
  },
  {
    id: "3",
    title: "Flipkart Electronics",
    merchant: "Flipkart",
    amount: 8999,
    date: "Yesterday",
    timestamp: new Date(Date.now() - 86400000 - 3600000).toISOString(),
    paymentMethod: "PhonePe",
    status: "Risk detected",
    riskLevel: getRiskLevelFromScore(62.5),
    riskScore: 62.5,
    isCompleted: false,
    riskFactors: [
      {
        factor_type: "amount",
        factor_name: "high_value_transfer",
        contribution: 40.0,
        explanation: "Amount exceeds your average daily transaction limit (₹5,000).",
      },
      {
        factor_type: "behaviour",
        factor_name: "unusual_time_pattern",
        contribution: 22.5,
        explanation: "Transaction initiated at an unusual time compared to your normal pattern.",
      },
    ],
    reasons: [
      "Payment amount is higher than your normal transaction pattern",
      "Initiated at an unusual time",
      "High-value transfer requires additional verification",
    ],
    trustedApproval: {
      required: true,
      contactName: "Priya Sharma",
    },
  },
  {
    id: "4",
    title: "Netflix Subscription",
    merchant: "Netflix",
    amount: 649,
    date: "30 Aug",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(2.1),
    riskScore: 2.1,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    riskFactors: [],
    reasons: [
      "Recurring monthly subscription",
      "Verified streaming service merchant",
    ],
    trustedApproval: { required: false },
  },
  {
    id: "5",
    title: "Unknown Merchant",
    merchant: "Unknown Merchant",
    amount: 12500,
    date: "29 Aug",
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    paymentMethod: "BHIM UPI",
    status: "Held",
    riskLevel: getRiskLevelFromScore(87.3),
    riskScore: 87.3,
    isCompleted: false,
    riskFactors: [
      {
        factor_type: "network",
        factor_name: "unverified_vpa",
        contribution: 45.0,
        explanation: "Recipient UPI handle has zero prior interaction history with any verified merchant.",
      },
      {
        factor_type: "behaviour",
        factor_name: "urgent_payment_coercion",
        contribution: 28.0,
        explanation: "Suspicious urgency phrasing detected during payment initiation.",
      },
      {
        factor_type: "amount",
        factor_name: "high_value_transfer",
        contribution: 14.3,
        explanation: "Amount is 2.5\u00d7 your average high-value transaction.",
      },
    ],
    reasons: [
      "Unrecognized UPI handle with no trusted history",
      "High-risk transaction amount flagged for review",
      "Possible social engineering pattern detected",
    ],
    trustedApproval: {
      required: true,
      contactName: "Priya Sharma",
    },
  },
  // ── Supplementary transactions (payment history depth) ──────────────────────
  {
    id: "6",
    title: "Reliance Fresh Supermarket",
    merchant: "Reliance Retail",
    amount: 1240,
    date: "28 Aug",
    timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    paymentMethod: "Paytm Payments",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(3.8),
    riskScore: 3.8,
    isCompleted: true,
    paymentAppUsed: "Paytm Payments",
    completionTimestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    riskFactors: [],
    reasons: ["Verified retail QR code scan"],
    trustedApproval: { required: false },
  },
  {
    id: "7",
    title: "Uber Rides India",
    merchant: "Uber BV",
    amount: 480,
    date: "27 Aug",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(5.0),
    riskScore: 5.0,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    riskFactors: [],
    reasons: ["Verified ride hailing merchant"],
    trustedApproval: { required: false },
  },
  {
    id: "8",
    title: "Apollo Pharmacy",
    merchant: "Apollo Hospitals",
    amount: 670,
    date: "26 Aug",
    timestamp: new Date(Date.now() - 86400000 * 6).toISOString(),
    paymentMethod: "PhonePe",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(4.5),
    riskScore: 4.5,
    isCompleted: true,
    paymentAppUsed: "PhonePe",
    completionTimestamp: new Date(Date.now() - 86400000 * 6).toISOString(),
    riskFactors: [],
    reasons: ["Verified healthcare merchant"],
    trustedApproval: { required: false },
  },
  {
    id: "9",
    title: "Tata Power Utility",
    merchant: "Tata Power DDL",
    amount: 2340,
    date: "25 Aug",
    timestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    paymentMethod: "BHIM UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(3.2),
    riskScore: 3.2,
    isCompleted: true,
    paymentAppUsed: "BHIM UPI",
    completionTimestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    riskFactors: [],
    reasons: ["Routine monthly utility bill payment"],
    trustedApproval: { required: false },
  },
  {
    id: "10",
    title: "BookMyShow Entertainment",
    merchant: "Bigtree Entertainment",
    amount: 920,
    date: "24 Aug",
    timestamp: new Date(Date.now() - 86400000 * 8).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(6.0),
    riskScore: 6.0,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 8).toISOString(),
    riskFactors: [],
    reasons: ["Verified movie ticketing merchant"],
    trustedApproval: { required: false },
  },
  {
    id: "11",
    title: "Zomato Dining",
    merchant: "Zomato Ltd",
    amount: 1850,
    date: "23 Aug",
    timestamp: new Date(Date.now() - 86400000 * 9).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(6.2),
    riskScore: 6.2,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 9).toISOString(),
    riskFactors: [],
    reasons: ["Verified restaurant billing"],
    trustedApproval: { required: false },
  },
  {
    id: "12",
    title: "Mumbai Metro Recharge",
    merchant: "Maha Mumbai Metro",
    amount: 453,
    date: "22 Aug",
    timestamp: new Date(Date.now() - 86400000 * 10).toISOString(),
    paymentMethod: "BHIM UPI",
    status: "Safe",
    riskLevel: getRiskLevelFromScore(2.1),
    riskScore: 2.1,
    isCompleted: true,
    paymentAppUsed: "BHIM UPI",
    completionTimestamp: new Date(Date.now() - 86400000 * 10).toISOString(),
    riskFactors: [],
    reasons: ["Standard transit recharge"],
    trustedApproval: { required: false },
  },
];

/**
 * Payment overview matching the requested demo stats:
 * ₹48,750 | 12 total | 9 safe | 3 need attention
 */
export const DEMO_PAYMENT_OVERVIEW: UserPaymentOverview = {
  totalAmountThisMonth: 48750,
  transactionCount: 12,
  safeCount: 9,
  needsReviewCount: 3,
  blockedCount: 0,
  reportedCount: 0,
  currentRiskLevel: getRiskLevelFromScore(78),
  currentRiskScore: 78,
  protectionStatus: "ATTENTION REQUIRED",
};

/**
 * Security alerts — 3 requested demo alerts.
 */
export const DEMO_ALERTS: SecurityAlert[] = [
  {
    id: "alert-1",
    category: "device",
    severity: getRiskLevelFromScore(82),
    title: "Suspicious login attempt",
    description: "Login attempt detected from a new device.",
    timestamp: "Just now",
    isRead: false,
    metadata: {
      riskScore: 82,
    },
    whatHappened:
      "An authentication attempt was detected from a device that has not been registered on your account.",
    whyFlagged: [
      "Device fingerprint not recognized",
      "Login attempted from a different city than your registered location",
      "Multiple failed PIN attempts before this session",
    ],
    whatYouShouldDo: [
      "Review trusted devices in Settings > Trusted Devices",
      "Change your password immediately if you do not recognize this device",
      "Enable biometric lock for additional protection",
    ],
  },
  {
    id: "alert-2",
    category: "payment",
    severity: getRiskLevelFromScore(62),
    title: "Unusual payment activity",
    description: "A payment amount is higher than your normal transaction pattern.",
    amount: "\u20b98,999",
    timestamp: "Yesterday",
    isRead: false,
    metadata: {
      riskScore: 62,
    },
    whatHappened:
      "A Flipkart payment of \u20b98,999 was flagged because it significantly exceeds your average daily transaction limit.",
    whyFlagged: [
      "Amount is 1.8\u00d7 above your average high-value transaction",
      "Payment initiated outside your usual active hours",
      "No prior purchase history with this merchant category",
    ],
    whatYouShouldDo: [
      "Review the Flipkart transaction in the Payments tab",
      "Confirm with your trusted contact if this purchase was intended",
      "Tap Approve if you recognize this payment",
    ],
  },
  {
    id: "alert-3",
    category: "device",
    severity: getRiskLevelFromScore(38),
    title: "New device detected",
    description: "Your account was accessed from a recently registered device.",
    timestamp: "Yesterday \u00b7 4:15 PM",
    isRead: true,
    metadata: {
      device: "Samsung Galaxy S23",
      riskScore: 38,
    },
    whatHappened:
      "A login was registered from a new Samsung Galaxy device that completed primary biometric enrollment.",
    whyFlagged: [
      "First login from this hardware ID",
      "Device biometric enrollment completed less than 24 hours ago",
    ],
    whatYouShouldDo: [
      "Confirm this device belongs to you in Settings > Trusted Devices",
      "Revoke access immediately if you do not recognize it",
    ],
  },
];

/**
 * Demo trusted devices — shown in Settings / Protection tabs.
 */
export const DEMO_TRUSTED_DEVICES = [
  {
    id: "device-1",
    name: "Samsung Galaxy S23",
    type: "Android",
    label: "Current device",
    status: "Trusted",
    lastActive: "Active now",
    isCurrent: true,
  },
  {
    id: "device-2",
    name: "Chrome on Windows",
    type: "Browser",
    label: "Web browser",
    status: "Trusted",
    lastActive: "Last active today",
    isCurrent: false,
  },
];

/**
 * Demo protection status — shown in Settings / Protection tabs.
 */
export const DEMO_PROTECTION_STATUS = {
  paymentProtection: true,
  otpShield: true,
  deviceProtection: true,
};
