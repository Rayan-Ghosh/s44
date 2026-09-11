import os
import subprocess
import numpy as np
import wave

DEMO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "demo_recordings")
os.makedirs(DEMO_DIR, exist_ok=True)

SCRIPTS = {
    "1_cyber_cell_anydesk_scam.wav": (
        "Hello, this is Senior Officer Vikram from Central Cyber Security Cell. "
        "Your bank account has been flagged for suspicious transactions and illegal overseas money laundering. "
        "You must install AnyDesk QuickSupport immediately so I can verify your device security token. "
        "Do not call your bank branch, this is urgent police procedure. "
        "You will receive a six digit verification OTP on SMS now. "
        "Read it out to me immediately to cancel the penalty and avoid immediate arrest."
    ),
    "2_digital_arrest_warrant_scam.wav": (
        "This is an emergency notification from Central Bureau of Investigation headquarters. "
        "A formal digital arrest warrant has been issued against your national identity. "
        "Under Supreme Court directives, you are placed under immediate digital arrest. "
        "Keep your camera on, do not contact your family or lawyer. "
        "Transfer forty-five thousand rupees immediately to the verified security account "
        "to clear your bail bond, or the local police patrol team will arrive at your door."
    ),
    "3_ai_voice_clone_deepfake.wav": (
        "Hey, it's me, please listen carefully, I am in serious trouble. "
        "I was in an accident on the highway and the police are detaining me. "
        "They took my wallet and I cannot access my phone. "
        "Please do not tell anyone, just send twenty-five thousand rupees to this emergency UPI number "
        "so they let me go. Please do it right now, I need your help immediately."
    ),
    "4_electricity_cutoff_scam.wav": (
        "Dear consumer, this is an urgent automated warning from State Electricity Helpline. "
        "Your power bill is overdue. Your electricity connection will be disconnected tonight at nine thirty. "
        "To avoid disconnection, pay the overdue bill reconnection fee immediately "
        "using the remote payment link sent to your phone."
    )
}

def synthesize_base_wav(filename, text, rate=0, voice="Microsoft David Desktop"):
    path = os.path.join(DEMO_DIR, filename)
    # Using PowerShell System.Speech to generate crisp uncompressed PCM WAV
    ps_command = f"""
    Add-Type -AssemblyName System.Speech;
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $synth.Rate = {rate};
    $synth.SelectVoice('{voice}');
    $synth.SetOutputToWaveFile('{path.replace(chr(92), "/")}');
    $synth.Speak('{text.replace("'", "''")}');
    $synth.Dispose();
    """
    cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_command]
    subprocess.run(cmd, check=True, capture_output=True)
    return path

def apply_deepfake_vocoder_artifacts(input_path, output_path):
    """
    Applies neural vocoder artifacts:
    - Pitch micro-tremor suppression (monotone robotic smoothing)
    - High-frequency metallic phase distortion (>4kHz)
    - Re-saves as 16kHz mono PCM for detector ingestion
    """
    with wave.open(input_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_data = wf.readframes(n_frames)

    # Convert to float numpy array
    dtype = np.int16 if sampwidth == 2 else np.uint8
    audio = np.frombuffer(raw_data, dtype=dtype).astype(np.float32)
    if n_channels > 1:
        audio = audio.reshape(-1, n_channels).mean(axis=1)

    # Normalize
    max_val = np.max(np.abs(audio)) or 1.0
    audio = audio / max_val

    # Resample to 16kHz if needed
    target_sr = 16000
    if framerate != target_sr:
        num_target_samples = int(len(audio) * target_sr / framerate)
        audio = np.interp(
            np.linspace(0, len(audio), num_target_samples, endpoint=False),
            np.arange(len(audio)),
            audio
        )

    # Inject neural vocoder metallic overtone (>4kHz harmonics) & flatline tremor
    t = np.arange(len(audio)) / float(target_sr)
    vocoder_carrier = 0.45 * np.sin(2 * np.pi * 5100 * t) + 0.35 * np.sin(2 * np.pi * 6200 * t)
    
    # Subtle flatline smoothing
    kernel = np.ones(5) / 5.0
    smoothed = np.convolve(audio, kernel, mode="same")
    synthetic = 0.65 * smoothed + 0.35 * (smoothed * vocoder_carrier) + 0.25 * vocoder_carrier

    # Scale back to int16
    synthetic = np.clip(synthetic / (np.max(np.abs(synthetic)) + 1e-8) * 30000, -32767, 32767).astype(np.int16)

    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(target_sr)
        wf.writeframes(synthetic.tobytes())

def main():
    print(f"Synthesizing demo scam recordings in {DEMO_DIR}...")
    for filename, text in SCRIPTS.items():
        print(f"Generating {filename}...")
        voice = "Microsoft Zira Desktop" if "voice_clone" in filename else "Microsoft David Desktop"
        temp_file = os.path.join(DEMO_DIR, f"temp_{filename}")
        final_file = os.path.join(DEMO_DIR, filename)

        if "deepfake" in filename:
            synthesize_base_wav(f"temp_{filename}", text, rate=1, voice=voice)
            apply_deepfake_vocoder_artifacts(temp_file, final_file)
            if os.path.exists(temp_file):
                os.remove(temp_file)
        else:
            synthesize_base_wav(filename, text, rate=0, voice=voice)

        size_kb = os.path.getsize(final_file) / 1024
        print(f"  -> Created {filename} ({size_kb:.1f} KB)")

if __name__ == "__main__":
    main()
