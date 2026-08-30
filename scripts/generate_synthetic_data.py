"""
Synthetic Data Generator for S40 Fraud Shield.

Generates realistic tabular datasets covering Scenarios A-F:
- Scenario A: Legitimate routine payment (Low Risk)
- Scenario B: Suspicious high amount + new recipient + new device (High Risk)
- Scenario C: Voice phishing / coercion payment (High Risk)
- Scenario D: Legitimate unusual payment / False positive candidate (Medium/High Risk)
- Scenario E: Device switch with verified owner (Medium Risk)
- Scenario F: Legitimate high-value user (High amount, but normal for user profile)

Outputs synthetic training and test CSV files into ml/data/synthetic/.
"""

import os
import sys
import json
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import Tuple

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Ensure target directories exist
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "ml", "data", "synthetic")
os.makedirs(DATA_DIR, exist_ok=True)


def generate_synthetic_dataset(num_samples: int = 50000, seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generates enterprise-scale synthetic transaction and voice datasets (50,000+ cases).
    """
    random.seed(seed)
    np.random.seed(seed)

    base_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    records = []
    voice_records = []

    user_ids = [f"USER_{i:04d}" for i in range(1, 501)]

    # Rich bilingual voice scam dialogues (Hindi, English, Hinglish, regional variations)
    scam_scripts = [
        "Your bank account will be blocked immediately within 5 minutes. Transfer money to police verification account now.",
        "I am RBI Cyber Cell Officer. Your account is linked to crime. Pay 25000 fine immediately or police will arrest you.",
        "Customer care warning: Urgent security block. Provide OTP and transfer money to safety wallet now.",
        "Yeh Cyber Crime Cell New Delhi se DCP Rathore bol rahe hain. Aapke naam pe digital arrest warrant issue hua hai.",
        "Aapka mobile number aur Aadhaar card illegal courier me use hua hai. Turant clearance fund transfer kijiye.",
        "Electricity board notice: Aapka bijli connection aaj raat 9 baje disconnect ho jayega. Bill update karein.",
        "Bank KYC suspension alert: Aapka SBI account 2 ghante me permanently freeze ho jayega. Verify details.",
        "Download AnyDesk application immediately to verify your payment refund and share screen access.",
        "Do not disconnect this call. Stay on line, do not talk to family members or we will send police team.",
        "Income tax refund of Rs 45,000 approved. Pay verification fee of Rs 4,999 to release amount instantly.",
        "Lottery prize won: Send 10% processing fee to government authorized account to claim reward.",
        "FedEx Customs department: Your parcel from Mumbai contains banned narcotics. Transfer penalty deposit.",
        "TRAI telecom alert: Your SIM card will be deactivated in 1 hour due to illegal bulk messaging.",
        "Supreme Court notice: Non-bailable arrest warrant issued in financial fraud case. Settle penalty now.",
        "Loan approval desk: Instant personal loan of 5 lakhs approved. Pay processing charges of 12500 to activate.",
        "Credit card reward points expiring today. Redeem cash of Rs 18,500 by entering card details and OTP.",
        "Enforcement Directorate notice: Transfer suspicious funds to government escrow account for clearance audit.",
        "Aap akele kamre me jaiye aur kisi ko mat batayiye. Yeh confidential national security inquiry hai.",
        "Bijli vibhag: Bill bhugtan na hone par turant light cut kar di jayegi. Diye gaye number par sampark karein.",
        "Install QuickSupport app on your mobile to remove malware virus and verify banking credentials.",
        "Mumbai Crime Branch: Aapke khate se money laundering hui hai. Court fine jama karein warna jail hogi.",
        "Telegram part-time job review task: Deposit Rs 10,000 security fund to unlock your daily commission payout.",
        "RTO Challan pending notice: Vehicle impound order issued. Pay traffic challan immediately on link.",
        "LPG gas subsidy suspended: Verify bank account details and transfer Rs 100 verification fee.",
        "Aapka PAN card cancel hone wala hai. Penalty charges turant pay karein to avoid penalty fine.",
        "Aapnar bank account theke illegal money laundering hoyeche. CBI thana theke bolchi, turant security taka transfer korun.",
        "Tumchya khyatyavar police action zali ahe. Non bailable warrant cancel karaycha asel tar lagech dharohar rashi jama kara.",
        "Ungal bank account illegal parcel case-la block aagudhu. Police arrest thavirkka udane panam anupunga.",
        "Mee bank account narcotics crime tho link ayyindi. Police custody lo veyyakunda undalante ventane security amount deposit cheyyandi.",
        "Thwade account te CBI case darj hoya hai. Court challan da jurmana turant jama karwao nahi taan giraftari hovegi.",
        "Tamara bank account ma illegal hawala transactions malya che. Turant police verification fee pay karo.",
        "Nimma bank khateyannu freeze madalagide. Police arrestinda thappisikollalu koodale hana vargayisi.",

        # --- Category: Bank Impersonation (OTP / CVV Phishing) ---
        "Sir uh, this is regarding your debit card, we noticed a suspicious charge of 500 dollars just now. To reverse it immediately I just need you to read out the O-T-P you received.",
        "Maam I am calling from your bank's fraud department, don't worry we caught it in time, but you need to confirm your identity, please tell me the six digit code sent to your phone right now.",
        "Hello sir, um, your card has been temporarily blocked due to unusual activity. To unblock immediately just share the CVV printed on the back of your card.",
        "This is bank security calling, hold on, we're seeing a withdrawal attempt on your account, quickly read me the OTP so we can cancel it before it processes.",

        # --- Category: Fake KYC / Account Suspension ---
        "Sir your Aadhaar linked KYC verification has expired, uh, your account will be suspended within 24 hours, please click the link we just sent and download the verification app immediately.",
        "This is urgent, your PAN and bank KYC mismatch has been detected, if not resolved today your account will be permanently suspended, click the SMS link now to update.",
        "Maam we tried to update your KYC but the document upload failed, please install this application from the link so our agent can verify it remotely right now.",
        "Your account KYC is flagged for immediate suspension due to non-compliance, click the link in the message and complete verification within the next 10 minutes.",

        # --- Category: Remote Access Scam ---
        "There's a technical error in your refund processing sir, uh, nothing to worry, just install AnyDesk from the play store and share the nine digit code so our engineer can fix it directly.",
        "Your payment failed due to a gateway glitch, in order to process your refund I need you to download TeamViewer and give me remote access to your screen.",
        "This is technical support, we detected a virus that's blocking your UPI, please install QuickSupport now so I can remove it remotely while you stay on the line.",
        "Sir don't disconnect, for the refund to go through in the next two minutes I need screen share access, just open AnyDesk and read me the code on screen.",

        # --- Category: Utility / Electricity Cutoff ---
        "This is an automated notice, uh, your electricity connection will be disconnected within 2 hours due to unpaid bill, pay immediately through the UPI link sent to avoid cutoff.",
        "Sir this is your final warning, power supply to your house will be cut in 2 hours unless the pending amount is settled right now via the payment link on SMS.",
        "Your water and electricity connection is scheduled for disconnection today evening, transfer the due amount immediately to the account number I'm sending to avoid this.",

        # --- Category: Law Enforcement / Digital Arrest / Customs ---
        "This is customs department, uh, we've intercepted a parcel with your Aadhaar details containing illegal items, you need to join a video call with the investigating officer immediately or a digital arrest warrant will be issued.",
        "Ma'am this is Cyber Crime, your bank account is under investigation for money laundering, do not disconnect the call, stay on line and transfer the bail amount to the court escrow account now.",
        "Sir I am from the narcotics control bureau, a package under your name has banned substances, unless you pay the customs penalty in the next hour we will have to proceed with arrest.",
        "This is a police verification call regarding illegal activity linked to your number, please don't inform your family, stay on this line, and transfer the security deposit to avoid immediate arrest.",

        # --- Category: Lottery / Reward / Cash Prize ---
        "Congratulations sir, uh, your credit card has ten thousand reward points expiring tonight, to redeem the cash value just confirm your card number and the OTP that's about to arrive.",
        "You've won a cash prize of fifty thousand rupees in our anniversary lucky draw, to claim it today please share your net banking login and the OTP for verification.",
        "This is regarding your expiring bank reward points worth 18,500 rupees, redeem now by entering your card details and the OTP on this call before midnight.",
    ]


    legit_scripts = [
        "Hey, sending payment for lunch yesterday.",
        "Paying monthly electricity bill.",
        "Transferring rent amount to landlord account.",
        "Payment for grocery and vegetables at supermarket.",
        "Chai and snacks payment via QR code.",
        "Paying school tuition fees for semester.",
        "Pharmacy medicine purchase payment.",
        "Cab ride fare settlement.",
        "Gym membership quarterly renewal.",
        "DTH recharge payment for 6 months.",
        "Split dinner bill with Rohit and Priya.",
        "Advance payment for home painting work.",
        "Buying train tickets on IRCTC for family vacation.",
        "Purchasing birthday gift on Amazon.",
        "Paying broadband internet monthly fiber plan.",
        "Society maintenance bill payment for August.",
        "Donation to local charitable trust.",
        "Car servicing and engine oil change payment.",
        "Movie tickets booking for weekend show.",
        "Mobile postpaid bill payment for self and spouse.",
        # Genuine bank/KYC/support calls that mention the exact words a
        # scam call would (OTP, PIN, bank, KYC, verify) but in a
        # protective or routine sense, not as a request for credentials.
        # Added after live testing showed the model flagged real
        # anti-fraud advisory calls as scams because it had never seen a
        # legitimate example using these words at all.
        "Hello, this is your bank calling for a routine KYC update. As always, please remember we will never ask you for your OTP or PIN over the phone.",
        "This is a reminder from your bank: never share your OTP, PIN, or CVV with anyone, including bank staff. We will never ask for it.",
        "Good afternoon, calling to confirm your KYC documents are up to date. No need to share any OTP or password for this, it is already verified in our system.",
        "Just a heads up, your KYC is due for renewal next month. You can update it at the branch, and remember, we never ask for OTP or PIN on a call.",
        "Namaste, hum aapke bank se KYC update ke liye call kar rahe hain. Kripya dhyan rahe, bank kabhi bhi phone par OTP ya PIN nahi maangta.",
        "Aapka KYC verify ho chuka hai, dhanyavaad. Yaad rakhiye, kisi ko bhi apna OTP ya PIN kabhi mat batayein, chahe woh khud ko bank employee bataye.",
        "Customer support here, just confirming your recent transaction went through fine. You never need to share your PIN or OTP with our support team.",
        "This is a courtesy call about our new savings account features. No action needed from you, and please note we never request OTP or PIN by phone.",
        "Hi, following up on your loan application status, it's still under review. As a reminder, do not share your CVV, PIN or OTP with anyone claiming to be from the bank.",

        # --- Category: Legitimate Bank Security Warning (hard negative) ---
        "Hi sir, this is your bank, uh, we blocked a suspicious transaction of 500 dollars on your card just now for your safety. Please do NOT share your OTP or password with anyone, including me — you can check the blocked transaction yourself in your official banking app.",
        "Maam this is a fraud alert from your bank, we've already stopped a suspicious withdrawal attempt. Just so you know, we will never call and ask for your OTP or CVV — if anyone does, please hang up and report it.",
        "This is an automated security message: we noticed an unusual login attempt and have locked it out. No action needed from you, and remember, our staff will never ask for your PIN over a call.",

        # --- Category: Legitimate Branch / KYC Visit Reminder (hard negative) ---
        "Good morning, your periodic KYC renewal is due this month. You can complete it by visiting your nearest branch with your Aadhaar and PAN, or update it inside the official mobile banking app — no OTP needed on this call.",
        "This is a reminder that your KYC documents need refreshing as per RBI guidelines. Please visit the branch at your convenience, there's no urgency and nothing to pay right now.",
        "Sir your KYC update is pending, you can either walk into any branch or use the verified app, whichever suits you, there's no deadline today.",

        # --- Category: Official Telemarketing / Credit Card Offer (hard negative) ---
        "Hello, this is regarding a pre-approved personal loan offer based on your account history. If you're interested I can email the full details, no credentials needed on this call.",
        "Hi maam, we have a credit card upgrade offer for you with better cashback, would you like me to send the terms to your registered email so you can review it at your own pace?",
        "This is a courtesy call about our new fixed deposit scheme with better interest rates, happy to send you a brochure by email, no rush to decide today.",

        # --- Category: Transaction Verification (hard negative) ---
        "This is an automated alert: did you authorize a charge of 1,200 rupees at Store X just now? Reply yes to confirm or no if you don't recognize it, no OTP required for this reply.",
        "Hi sir, quick check, we see a large transaction on your card at an electronics store, can you confirm if that was you? If not we'll block the card right away.",
        "This is your bank confirming a fund transfer of 15,000 rupees you initiated ten minutes ago, just confirming it went through successfully.",

        # --- Category: Courier / Delivery Coordination (hard negative) ---
        "Hi, I'm outside your building with your delivery, could you tell me the gate entry code or come down for a moment?",
        "This is your delivery executive, I'm at the address but can't find the entrance, could you guide me or share your landmark?",
        "Hello, your package is out for delivery today between 2 and 5 pm, please make sure someone is available to receive it.",

        # --- Category: Customer Support Follow-up (hard negative) ---
        "Hi, just following up on the support ticket you raised last week, has the issue been resolved on your end?",
        "This is customer care checking in, was our technician able to fix the problem you reported yesterday?",
        "Hello, we wanted to confirm your recent service request is closed, please let us know if you need anything else.",

        # --- Hard boundary edge case: caller is suspicious, agent verifies calmly ---
        "Sir this is your bank calling about a KYC update. — Wait, is this a fraud call? — That's a fair question, sir, I completely understand the caution. I will never ask for your OTP or PIN. You can verify this call is genuine by calling the official number on the back of your card, or checking the notice in your banking app under KYC status.",
        "Maam we're calling to verify a recent transaction. — How do I know you're really from the bank? — Good question, you're right to check. I won't ask for any OTP, PIN or password. Please feel free to hang up and call the number on your card directly, we'll have the same record on file.",
    ]


    for i in range(num_samples):
        # Chronological timestamps spaced over 180 days
        txn_time = base_time + timedelta(seconds=i * 620 + random.randint(0, 300))
        user_id = random.choice(user_ids)
        
        # Scenario allocation
        # 88% Legitimate (Scenario A, D, E, F), 12% Fraud (Scenario B, C)
        scenario = random.choices(
            ["A", "B", "C", "D", "E", "F"],
            weights=[0.60, 0.06, 0.06, 0.12, 0.08, 0.08],
            k=1
        )[0]

        is_fraud = 1 if scenario in ["B", "C"] else 0

        # User baseline profiles
        if scenario == "F":
            # Legitimate high-value user (wealthy / business owner)
            normal_avg = random.uniform(40000.0, 75000.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(25000.0, 150000.0)
            new_device = 0
            recipient_novelty = 0 if random.random() > 0.35 else 1
            velocity_10m = random.randint(1, 2)
            voice_risk = random.uniform(0.0, 0.10)
        elif scenario == "A":
            # Standard legitimate routine payment
            normal_avg = random.uniform(400.0, 1500.0)
            normal_std = normal_avg * 0.40
            amount = max(30.0, random.gauss(normal_avg, normal_std))
            new_device = 0
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.12)
        elif scenario == "B":
            # Suspicious high amount + new recipient + new device
            normal_avg = random.uniform(300.0, 1200.0)
            normal_std = normal_avg * 0.30
            amount = random.uniform(normal_avg * 8.0, normal_avg * 35.0)
            new_device = 1
            recipient_novelty = 1
            velocity_10m = random.randint(3, 8)
            voice_risk = random.uniform(0.15, 0.45)
        elif scenario == "C":
            # Voice phishing / coercion payment
            normal_avg = random.uniform(500.0, 2000.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(5000.0, 45000.0)
            new_device = random.choice([0, 1])
            recipient_novelty = 1
            velocity_10m = random.randint(2, 6)
            voice_risk = random.uniform(0.75, 0.98)
        elif scenario == "D":
            # Legitimate unusual payment (False positive candidate / festive shopping)
            normal_avg = random.uniform(500.0, 1500.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(normal_avg * 3.0, normal_avg * 6.0)
            new_device = 0
            recipient_novelty = 1 if random.random() > 0.5 else 0
            velocity_10m = random.randint(1, 2)
            voice_risk = random.uniform(0.0, 0.15)
        else: # Scenario E
            # Device switch with verified owner
            normal_avg = random.uniform(800.0, 2500.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(500.0, 3500.0)
            new_device = 1
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.10)

        # Mathematical feature derivations
        amount_zscore = (amount - normal_avg) / max(normal_std, 50.0)
        amount_vs_avg_ratio = amount / max(normal_avg, 10.0)
        amount_vs_max_ratio = amount / max(normal_avg * 3.5, amount)

        hour_float = txn_time.hour + (txn_time.minute / 60.0)
        time_sin = np.sin(2.0 * np.pi * hour_float / 24.0)
        time_cos = np.cos(2.0 * np.pi * hour_float / 24.0)

        location_distance_km = 0.0 if new_device == 0 else random.uniform(50.0, 850.0)
        travel_speed_kmh = location_distance_km / max(random.uniform(0.2, 2.5), 0.1)

        # Velocity metrics and ratios
        vel_10m = velocity_10m
        vel_1h = velocity_10m + random.randint(0, 4)
        vel_24h = velocity_10m + random.randint(1, 12)
        expected_10m = (vel_24h / 144.0) + 1e-5

        time_delta_sec = random.uniform(10.0, 7200.0)
        rapid_successive = 1.0 if time_delta_sec < 60.0 else 0.0

        record = {
            "transaction_id": f"TXN_{i:06d}",
            "timestamp": txn_time.isoformat(),
            "user_id": user_id,
            "scenario": scenario,
            "amount": round(amount, 2),
            "normal_avg_amount": round(normal_avg, 2),
            "normal_std_amount": round(normal_std, 2),
            "amount_zscore": round(amount_zscore, 4),
            "amount_vs_avg_ratio": round(amount_vs_avg_ratio, 4),
            "amount_vs_max_ratio": round(amount_vs_max_ratio, 4),
            "velocity_10m": vel_10m,
            "velocity_1h": vel_1h,
            "velocity_24h": vel_24h,
            "velocity_ratio_10m_24h": round(vel_10m / expected_10m, 4),
            "rapid_successive_transfer": rapid_successive,
            "time_sin": round(time_sin, 4),
            "time_cos": round(time_cos, 4),
            "recipient_novelty": recipient_novelty,
            "recipient_frequency": 0 if recipient_novelty == 1 else random.randint(3, 25),
            "new_device": new_device,
            "device_age_days": 0 if new_device == 1 else random.randint(30, 400),
            "ip_novelty": new_device,
            "location_distance_km": round(location_distance_km, 2),
            "impossible_travel_speed_kmh": round(travel_speed_kmh, 2),
            "os_change": new_device,
            "browser_change": new_device,
            "device_account_count": 1 if new_device == 0 else random.randint(1, 4),
            "voice_risk_score": round(voice_risk, 4),
            "is_fraud": is_fraud,
        }
        records.append(record)

        # Voice script data — labeled independently of the transaction-level
        # fraud scenario (voice-scam rate and transaction-fraud rate are
        # different things). Deliberately 40% scam / 60% legitimate: rich
        # enough scam representation for the classifier to learn real
        # patterns, while keeping the majority class realistic — and
        # (this matters most) diverse enough non-scam examples that
        # protective/routine calls mentioning "OTP", "PIN", "bank", "KYC"
        # aren't all lumped in with the 12%-ish fraud rate the transaction
        # side uses, which is what caused the model to under-learn what a
        # legitimate bank call actually sounds like.
        if random.random() < 0.40:
            script = random.choice(scam_scripts)
            is_scam = 1
        else:
            script = random.choice(legit_scripts)
            is_scam = 0

        voice_records.append({
            "transaction_id": record["transaction_id"],
            "script": script,
            "is_scam": is_scam
        })

    df_txns = pd.DataFrame(records)
    df_voice = pd.DataFrame(voice_records)

    # Save to CSV
    txn_path = os.path.join(DATA_DIR, "transactions_synthetic.csv")
    voice_path = os.path.join(DATA_DIR, "voice_scripts_synthetic.csv")

    df_txns.to_csv(txn_path, index=False)
    df_voice.to_csv(voice_path, index=False)

    print(f"[DATA GENERATOR] Successfully generated {len(df_txns)} transactions at {txn_path}")
    print(f"[DATA GENERATOR] Successfully generated {len(df_voice)} voice scripts at {voice_path}")

    return df_txns, df_voice


if __name__ == "__main__":
    generate_synthetic_dataset()

