# Makes the "speaker" audio for the demo with edge-tts: 16 kHz PCM to feed the interpreter,
# and a 44.1 kHz WAV to play in the final video.
# Usage: python demo/make_speech.py
import pathlib, subprocess, time

out = pathlib.Path("demo/speech"); out.mkdir(parents=True, exist_ok=True)
LINES = {
    "de": ("de-DE-KatjaNeural", "Komm doch mal vorbei, ich freu mich!"),
    "meeting": ("en-US-BrianNeural", "Thanks so much for joining today, everyone. I'm really excited to share our results with you."),
}
for key, (voice, text) in LINES.items():
    mp3 = out / f"{key}.mp3"
    for attempt in range(4):   # the TTS service occasionally returns nothing; try again
        if subprocess.run(["python", "-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", str(mp3)]).returncode == 0:
            break
        time.sleep(3)
    else:
        raise SystemExit(f"TTS failed for {key}")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ar", "16000", "-ac", "1", "-f", "s16le", str(out / f"{key}.pcm")], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ar", "44100", "-ac", "1", str(out / f"{key}.wav")], check=True)
    print("made", key)
