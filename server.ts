import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Setup WebSocket Server for Live Audio
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs, req) => {
    console.log("Client connected to /live websocket");
    
    // Parse target language from query params
    let targetLang = "Spanish";
    try {
      const parsedUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      const langParam = parsedUrl.searchParams.get("lang");
      if (langParam) {
        targetLang = langParam;
      }
    } catch (e) {
      console.warn("Could not parse targetLang from URL", e);
    }
    
    let session: any = null;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in environment variables.");
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts && parts.length > 0) {
              const audioData = parts[0]?.inlineData?.data;
              if (audioData && clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ audio: audioData }));
              }
            }
            if (message.serverContent?.interrupted) {
              if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: `You are a real-time voice-to-voice language translator. If I speak in English, instantly translate and speak back in ${targetLang}. If I speak in ${targetLang}, instantly translate and speak back in English. Be concise, accurate, and do not add any conversational filler. Only speak the translation.`,
        },
      });

      // Save resolved session for cleanup
      sessionPromise.then(s => { session = s; }).catch(e => console.error(e));

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            sessionPromise.then(s => {
              s.sendRealtimeInput({
                audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
              });
            }).catch(e => console.error("Error waiting for session", e));
          }
        } catch (e) {
          console.error("Error sending realtime input:", e);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected from /live websocket");
        if (session && typeof session.close === 'function') {
           try { session.close(); } catch(e) {}
        }
      });

    } catch (e: any) {
      console.error("Failed to setup Live API:", e);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: e.message || "Failed to connect to Live API" }));
        clientWs.close();
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For express v4
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Use server.listen instead of app.listen to start both Express and WSS
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
