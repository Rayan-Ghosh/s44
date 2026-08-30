export interface UserCallItem {
  id: string;
  callerName: string;
  phoneNumber: string;
  time: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW" | "SAFE";
  status: "Flagged Threat" | "Safe Call" | "Reported Scam" | "Verified Safe";
  duration: string;
  indicators?: string[];
  recommendation?: string;
}

export const INITIAL_USER_CALLS: UserCallItem[] = [
  {
    id: "call-1",
    callerName: "Unknown Caller (Bank Impersonation)",
    phoneNumber: "+91 1800 209 8888",
    time: "Today · 11:42 AM",
    duration: "45 sec",
    riskLevel: "HIGH",
    status: "Flagged Threat",
    indicators: [
      "Caller requested SMS verification OTP",
      "Caller requested sensitive banking credentials",
      "Caller claimed to be bank security department",
    ],
    recommendation: "Never share OTP or PIN over a phone call. Official bank support will never ask for your verification code.",
  },
  {
    id: "call-2",
    callerName: "Airtel Customer Care",
    phoneNumber: "121",
    time: "Yesterday · 3:20 PM",
    duration: "2 min 15 sec",
    riskLevel: "SAFE",
    status: "Safe Call",
  },
  {
    id: "call-3",
    callerName: "Swiggy Delivery Partner",
    phoneNumber: "+91 98234 11223",
    time: "Yesterday · 1:05 PM",
    duration: "30 sec",
    riskLevel: "SAFE",
    status: "Safe Call",
  },
  {
    id: "call-4",
    callerName: "Potential Lottery Scam",
    phoneNumber: "+91 91234 56789",
    time: "20 Aug · 4:10 PM",
    duration: "18 sec",
    riskLevel: "HIGH",
    status: "Reported Scam",
    indicators: [
      "Claimed cash prize reward requiring advance transfer",
      "Artificial urgency & intimidation tactics",
    ],
  },
];

export class CallService {
  static async getCalls(): Promise<UserCallItem[]> {
    return [...INITIAL_USER_CALLS];
  }

  static async reportCall(id: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 200));
  }

  static async markCallSafe(id: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 200));
  }
}
