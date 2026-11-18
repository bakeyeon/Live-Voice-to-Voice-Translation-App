import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

// The same SFF anchors as Sentiment Translator's scoring rubric (docs/scoring-rubric.md there),
// plus how each level should sound when spoken.
const SFF_RUBRIC = `SFF rubric (Sentiment-Formality-Friendliness). Anchor sentences:
- sentiment (-1.0 to 1.0): -0.9 "I hate this." | -0.7 "That's disappointing." | 0.0 "The meeting is at 3." | 0.5 "Sounds good." | 0.8 "Thanks so much!" | 0.95 "I love you, mom."
- formality (0 to 100): 0 "ㅇㅋ" | 10 "Komm vorbei!" | 45 "Could you come by?" | 55 "Kommen Sie bitte vorbei." | 70 "Würden Sie bitte vorbeikommen?" | 85 "Wir bitten Sie, bei uns vorbeizukommen." / "참석해 주시기 바랍니다."
  A standard polite form (German Sie, Korean -요, Japanese です/ます) is the everyday polite default (50-60), not high formality.
- friendliness (0 to 100): 15 "Your request has been received. Please wait." | 35 "Nice to meet you." | 50 "Hey, want to grab lunch?" | 70 "Komm vorbei!" | 95 "I love you, mom."

How to voice each level:
- Sentiment: 0.6 and above, bright and warm, a smile in the voice. 0.2 to 0.6, light and pleasant. -0.2 to 0.2, neutral and natural. -0.5 and below, subdued or disappointed, never theatrical. -0.8 and below, tense or upset, still controlled.
- Friendliness: 70 and above, close and casual, relaxed pace. 40 to 70, friendly but neutral. 30 and below, distant and matter-of-fact.
- Formality: 75 and above, calm, measured and polite, with clear articulation. 45 to 60, everyday polite. 20 and below, casual and quick.
- Softening particles (Thai นะ, Japanese ね, German doch / mal, a soft Korean -요) and, in written input, emoji and punctuation (!, ~, ㅋㅋ, 😊) are feeling cues. Carry them over with an equivalent particle or phrasing in the other language, and with a softer, rising or playful intonation.
- Match the intensity of the original. Do not exaggerate.`;

const instruction = (home: string, target: string) => `You are a live interpreter between ${home} and ${target}.
When you hear or read ${home}, translate it into ${target}. When you hear or read ${target}, translate it into ${home}.
Only ever say the translation: no greetings, comments, explanations or filler. If the input is a question or a request, translate it; never answer it.

Keep the feeling, not just the words. Before you speak, judge the original on the SFF rubric below, then match the same sentiment, formality and friendliness in your translation, through word choice and through your voice.

${SFF_RUBRIC}`;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", model: LIVE_MODEL });
  });

  // One Live API session per browser connection. The browser can send microphone audio ({ audio })
  // or typed text ({ text }); it receives translated audio plus transcripts of both sides.
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
    let target = "Spanish";
    let home = "English";
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      target = url.searchParams.get("lang") || target;
      home = url.searchParams.get("home") || home;
    } catch (e) {
      console.warn("Could not parse languages from URL", e);
    }
    const send = (payload: object) => {
      if (clientWs.readyState === clientWs.OPEN) clientWs.send(JSON.stringify(payload));
    };

    let session: any = null;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing in environment variables.");
      const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });

      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => send({ ready: true }),
          onmessage: (message: LiveServerMessage) => {
            const sc = message.serverContent;
            if (!sc) return;
            for (const part of sc.modelTurn?.parts || []) {
              if (part.inlineData?.data) send({ audio: part.inlineData.data });
            }
            if (sc.inputTranscription?.text) send({ inText: sc.inputTranscription.text });
            if (sc.outputTranscription?.text) send({ outText: sc.outputTranscription.text });
            if (sc.interrupted) send({ interrupted: true });
            if (sc.turnComplete) send({ turnComplete: true });
          },
          onerror: (e: any) => send({ error: e?.message || "Live API error" }),
          onclose: (e: any) => send({ closed: true, reason: e?.reason || "" }),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: instruction(home, target),
        },
      });
      sessionPromise.then((s) => { session = s; }).catch((e) => {
        console.error(e);
        send({ error: e?.message || "Failed to connect to Live API" });
      });

      clientWs.on("message", (data) => {
        let parsed: any;
        try { parsed = JSON.parse(data.toString()); } catch { return; }
        sessionPromise.then((s) => {
          if (parsed.audio) {
            s.sendRealtimeInput({ audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" } });
          } else if (parsed.audioEnd) {
            s.sendRealtimeInput({ audioStreamEnd: true });
          } else if (typeof parsed.text === "string" && parsed.text.trim()) {
            s.sendRealtimeInput({ text: parsed.text.trim() });
          }
        }).catch((e) => console.error("Error sending to Live session", e));
      });

      clientWs.on("close", () => {
        if (session && typeof session.close === "function") {
          try { session.close(); } catch {}
        }
      });
    } catch (e: any) {
      console.error("Failed to set up Live API:", e);
      send({ error: e.message || "Failed to connect to Live API" });
      clientWs.close();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (${LIVE_MODEL})`);
  });
}

startServer().catch(console.error);
