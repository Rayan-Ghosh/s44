# AVARAN — Multilingual Vishing Defense: Phase 1 Build Spec

**For:** Antigravity agent execution
**Source:** AVARAN architectural audit (read-only, non-mutating) — 4-phase multimodal defense blueprint
**Scope of this pass:** Multilingual (Hindi/Bengali/Odia) scam-call intent detection + one cheap, high-value active-defense addition. Everything else in the original blueprint is explicitly deferred (see §6).

---

## 0. Why this scope, and not the full blueprint

The source audit proposes a 4-phase, enterprise-grade multimodal defense stack: on-device edge ASR, IndicBERT-v2 intent classification, audio anti-spoofing (AASIST-L), video deepfake detection (MediaPipe FaceMesh + SyncNet), a dynamic Bayesian fusion network (pgmpy), and an interactive "Columbo Protocol" counter-inquiry copilot.

That's a reasonable long-term vision, but two of its core assumptions don't hold up under scrutiny, and most of the rest is multi-week specialized ML/vision work a small student team doesn't have bandwidth for in a hackathon window:

1. **IndicBERT-v2 fine-tuning needed a labeled Hindi/Bengali/Odia scam-call dataset that appeared not to exist when this was first checked** (data.gov.in/NCRB, Kaggle Fraud Call India, VISHGUARD, and AI4Bharat/Bhashini Kathbath/IndicTTS were all ruled out). **That conclusion turned out to be wrong — see §5 for the correction and Task 7 below.** A real one (INDICA/IndiF) surfaced on closer verification, but it's new, synthetic, and unvetted enough that it earns a validation spike, not a leap straight to production fine-tuning.
2. **AASIST-L, MediaPipe FaceMesh, SyncNet, and a Bayesian fusion network** are each independent research-engineering efforts. Bolting all of them onto a stable, working system in a short window is high integration risk for uncertain demo payoff.

So this spec keeps the *ambition* of Phase 1 (true multilingual coverage, not just English + primitive Hindi regex) but implements it **without a model that can't be trained** — pure multilingual lexicons + fast string matching, which is honest, buildable, and testable. It also pulls forward one *cheap* piece of Phase 3 (static counter-inquiry traps) because it has real demo value and zero ML dependency.

**Phases 2 and 4 of the original blueprint are not touched. Do not implement them in this pass.**

---

## 1. Current baseline (context, not to be re-derived)

- Scam-call NLP: regex-based keyword matching across 5 English taxonomies (Urgency/Threat/Authority/Financial/Credential), with a 40-character backward negation window (`_is_negated()`) and basic Devanagari regex for "Digital Arrest" only. Everything else is English-only.
- Risk accumulation: stateful leaky-bucket accumulator (`γ = 0.85`), thresholds SAFE (<0.35) / ELEVATED (0.35–0.69) / CRITICAL (≥0.70). **This logic works — do not rewrite it.**
- Telephony: WebSocket ingestion of audio/text chunks, bridged to Bhashini cloud STT. Works, but adds 600–1200ms latency — known limitation, not being solved in this pass.
- Android: `FraudOverlayManager.kt` already shows a working floating warning card with a 5-second countdown and end-call action.

---

## 2. Tasks (do these, in order)

### Task 1 — Multilingual lexicons (Hindi / Bengali / Odia + Romanized code-switch)
Build JSON lexicons for the same 5 scam-intent categories the audit identified, each containing native-script *and* common Romanized/code-switched spellings (Hinglish, Banglish, Odia-glish):
- `digital_arrest.json`
- `child_custody.json`
- `electricity_cut.json`
- `kyc_freeze.json`
- `customs_parcel.json`

Source the phrases from: RBI/NPCI public fraud advisories, the Chakshu portal's listed scam categories, and known scam-script writeups in Indian news coverage of digital-arrest/KYC/power-cut scams — not from a trained model, since none exists. Store under `ml/nlp/lexicons/`.

### Task 2 — Aho-Corasick token trie
`ml/nlp/aho_corasick_trie.py` — multi-string, multi-script simultaneous matcher, O(n), loading all 5 lexicon files across Hindi/Bengali/Odia/English. This directly implements the audit's Lane-1 idea, but purely lexicon-driven (no ML dependency, no training data needed).

### Task 3 — Code-mixed normalizer
`ml/nlp/code_mixed_normalizer.py` — normalizes Romanized Hindi/Bengali/Odia input to a canonical form before trie matching, so spelling variants (e.g. "bijli" / "bijlee" / "bidyut") still hit. Simple phonetic-rule based is fine; no transformer needed.

### Task 4 — Extend the negation window
Reuse the existing 40-character backward-lookback `_is_negated()` pattern, but add negation markers for Hindi and Bengali. **Do not guess the Odia negation list — leave it as a flagged TODO for native-speaker input** (see guardrails).

### Task 5 — Wire it into `voice/classifier.py`
Replace the current English-only regex path with the trie-based lookup across Hindi/Bengali/Odia/English. Leave the leaky-bucket accumulator and threshold logic completely untouched — it already works.

### Task 6 (optional but recommended — cheap, high demo value)
**Static Columbo Protocol.** Skip the audit's dynamic trap *generator* (needs more context-modeling than is worth building now). Instead: when the leaky-bucket crosses ELEVATED and the matched category is `DIGITAL_ARREST_POLICE` or `CHILD_CUSTODY_EXTORTION`, surface one of 2–3 pre-written trap questions (the audit's own "Phantom Detail" / "Administrative Dead-End" examples) as static text through the *existing* `FraudOverlayManager.kt` HUD. No new ML, no vision pipeline, no state machine complexity — just a small prompt library and one extra field on the existing overlay.

### Task 7 (new — data validation spike, run in parallel, does not block Tasks 1–6)
A real labeled multilingual fraud-call dataset (INDICA/IndiF) surfaced during dataset research — see §5. Before trusting it for anything real:
1. Download only the `Hindi_audio.tar.gz` and `Text_samples.tar.gz` subsets first (not all 10 languages — that's 362GB total).
2. Manually listen to ~20 samples labeled `scam` and ~20 labeled non-fraud. Check: does the synthetic speech sound natural enough to be useful, or is it obviously robotic in a way that would make a classifier trained on it fail on real calls?
3. Check whether its 7 fraud-type categories can be reasonably remapped to AVARAN's 5 categories (digital_arrest, child_custody, electricity_cut, kyc_freeze, customs_parcel) — likely partial overlap (banking_fraud → kyc_freeze-ish, kidnapping → child_custody-ish), not exact.
4. Confirm the license permits use in a hackathon/derivative-model context before going further.
5. Only if all four check out: treat IndicBERT-v2 fine-tuning as unblocked and scope it as a **separate, later task** — it does not replace or block the lexicon work in Tasks 1–6, which ships regardless of how this spike turns out.

---

## 3. Guardrails while implementing

- **Do not touch anything under `voice/` beyond `classifier.py` and the new `ml/nlp/` files.** Earlier project notes flagged a "never touch the voice model" constraint whose exact scope this context doesn't fully capture — confirm with the team before going near anything that could be that model.
- **Do not blend or retrain the two separate UPI ML model families** (synthetic-only vs. real-data recipient-risk). Completely out of scope here.
- **Do not edit `S40_End_to_End_Project_Plan_FINAL.md`.**
- **Zero raw audio/text retention** — keep the existing RAM-only processing constraint; nothing new here should persist call content to disk.
- **Native-speaker review required before merging any lexicon or negation list:** Hindi and Bengali can be reviewed directly; Odia needs a teammate who's a native or fluent Odia speaker — don't ship unreviewed Odia phrasing.
- **No new heavy ML dependencies** (no `transformers`, `torch`, `onnxruntime`, `mediapipe`, `pgmpy`, `sherpa-onnx`) in this pass. If a task seems to need one, stop and flag it instead of adding it.

---

## 4. Directory changes (trimmed from the full blueprint)

```
ml/
└── nlp/
    ├── __init__.py
    ├── aho_corasick_trie.py         # [NEW]
    ├── code_mixed_normalizer.py     # [NEW]
    └── lexicons/
        ├── digital_arrest.json      # [NEW] HI/BN/OR + Romanized variants
        ├── child_custody.json       # [NEW]
        ├── electricity_cut.json     # [NEW]
        ├── kyc_freeze.json          # [NEW]
        └── customs_parcel.json      # [NEW]
voice/
└── classifier.py                    # [MODIFY] route through trie, keep leaky-bucket untouched
engine/
└── copilot/                         # [NEW, only if Task 6 done]
    ├── __init__.py
    └── static_trap_prompts.py
apps/mobile/android/.../ui/
└── FraudOverlayManager.kt           # [MODIFY, optional] surface trap prompt text field
```

---

## 5. Dataset research findings (verified before trusting)

The team compiled a broader dataset catalog while researching this. It was spot-checked before anything from it went into this spec — about half of it holds up, half doesn't:

**Confirmed real — and directly relevant (verified after initial research missed it):**
- **INDICA / IndiF (`vikrant-vikram/INDICA` on Hugging Face, DOI 10.57967/hf/8492)** — real. This is a labeled, multilingual telecom-fraud-call benchmark: 189,420 samples across 10 Indic languages **including Hindi, Bengali, and Odia**, audio + text, with a binary Fraud/Non-Fraud label and 7 fraud-type categories (Banking Fraud, Phishing, Lottery Scam, Kidnapping, Identity Theft, Customer Service Impersonation, Investment Scam). This is the dataset earlier research concluded didn't exist — it does. Caveats before relying on it: it's **synthetic/TTS-generated** audio (not real recorded calls), it's a very new/low-adoption dataset (published 2026, essentially unvetted by the community), its category taxonomy doesn't map 1:1 onto AVARAN's specific scam types (digital arrest, KYC freeze, electricity cut, customs parcel), and its exact license/terms weren't visible on inspection — confirm all of this before depending on it. **This changes §6/§7 below — see Task 7.**
- **Bangla Audio Original/DeepFake dataset (Mendeley, DOI 10.17632/4ftmwt86vr.1)** — real, confirmed. 4,500 clips (2,250 real / 2,250 fake), 75 Bengali speakers, University of Asia Pacific. Genuinely useful for future Bengali audio-spoofing work.
- `ai4bharat/IndicVoices`, `ai4bharat/Kathbath` — general Hindi/Bengali/Odia ASR speech (already known, not fraud-specific)
- `InfoBayAI/Hindi-Call-Center-Audio-Dataset-Single-Channel` — real, general call-center audio. Usable **only as baseline/negative-class ("ham") audio**, not as scam-positive training data.
- `vdivyasharma/IndicSynth` — real, ACL 2025 published, ~4,000 hrs synthetic/bonafide speech across 12 Indic languages. Relevant to future audio-spoofing work, not to this pass.
- `InDeepFake` (IEEE DataPort, DOI 10.21227/395c-wt73) and `IndieFake` (arXiv 2506.19014) — real Indian audio/video deepfake datasets. Relevant to future video/audio-tampering work, not to this pass.
- MLAAD, WaveFake, ASVspoof, In-The-Wild, FakeAVCeleb, FaceForensics++, Celeb-DF, DFDC, AV-Deepfake1M — all real, established global benchmarks.
- A real Bangla SMS smishing dataset exists (Tanbhir & Shahriyar, IEEE DataPort, DOI 10.21227/vxz9-ak04, 2,287 labeled messages) — close to what was catalogued, though possibly under a different exact host/repo name than listed.

**Could not verify — still treat as unconfirmed, do not build against without checking yourself:**
- "SpamShield" language-coverage claim ("23 languages incl. Hindi/Bengali/Marathi/Telugu") — the dataset family exists, but the verifiable version's language breakdown didn't match that claim.
- SMSDHL, "Adaption Fraud and Cyber Safety," "Tri-Fraud Alerts India" — unconfirmed; click through and verify before relying on any of them.

**Correction from an earlier pass of this document:** INDICA/IndiF was initially flagged here as likely fabricated after a search turned up no trace of it. That was wrong — it exists and is directly relevant. Treat that as a reminder that "couldn't find it" is weaker evidence than actually opening the link, not proof of non-existence.

---

## 6. Explicitly deferred — do NOT implement this pass

- AASIST-L / any audio anti-spoofing (Phase 2)
- MediaPipe FaceMesh / SyncNet / any visual deepfake detection (Phase 2–3)
- Out-of-band SMS / geofence safety verification (needs telecom + consent/privacy review first)
- Dynamic Bayesian Network fusion via `pgmpy` — keep the existing 4-term saturation formula; leave a clear comment in `fusion.py` marking where a future fusion head would plug in, nothing more
- On-device Sherpa-ONNX ASR — keep Bhashini cloud STT for now; the latency gap is a known, tracked limitation, not something this pass solves
- IndicBERT-v2 deep-path classifier — **no longer flatly deferred for lack of data** (see §5, Task 7). Still not in scope for *this* pass: fine-tuning is a separate, later task gated on Task 7's validation results.

---

## 7. Future data work (tracked separately, not part of this build)

The IndicBERT-v2 deep-path is gated on Task 7's validation spike (§2), not on a total absence of data anymore — see §5 for the correction. If Task 7 checks out, fine-tuning becomes a real near-term option, not a someday-maybe.

If Task 7 doesn't check out (synthetic audio too unnatural, license blocks use, categories don't remap cleanly), fall back to:
1. Translate/localize existing English scam-call scripts into Hindi/Bengali/Odia and synthesize audio via AI4Bharat's Indic TTS voices, producing a synthetic labeled corpus.
2. Scrape and manually label Hindi/Bengali scam-call videos from YouTube scam-baiting channels, the way existing English scam-baiter transcript corpora were built.

Either way, don't block Phase 1 lexicon work (Tasks 1–6) on this — they ship independently.

---

## 8. Acceptance criteria

- [ ] Existing English detection path passes all current tests, unmodified in behavior
- [ ] New lexicon-based matching correctly triggers on a test set of Hindi/Bengali/Odia and Hinglish/Banglish scam phrases (add fixtures covering all 5 categories × 3 languages)
- [ ] Negation window correctly suppresses false positives in Hindi and Bengali test cases (Odia negation deferred until native-speaker review lands)
- [ ] Trie lookup latency stays well under the original <150ms fast-path budget (pure string matching should clear this easily — measure and record it)
- [ ] No new heavy ML dependencies added to `requirements.txt`
- [ ] (If Task 6 done) trap prompt text surfaces correctly in `FraudOverlayManager.kt` without breaking the existing countdown/end-call flow
