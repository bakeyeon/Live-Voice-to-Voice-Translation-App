import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Globe2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function pcmToBase64(f32Array: Float32Array): string {
  const buffer = new ArrayBuffer(f32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < f32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, f32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcm(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 0x8000;
  }
  return float32Array;
}

export default function App() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState('Spanish');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const wsUrl = window.location.protocol === 'https:' 
        ? `wss://${window.location.host}/live?lang=${encodeURIComponent(targetLang)}` 
        : `ws://${window.location.host}/live?lang=${encodeURIComponent(targetLang)}`;
        
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setIsConnecting(false);
        try {
          // Initialize Audio Context for 16kHz capture as required by API
          const audioCtx = new window.AudioContext({ sampleRate: 16000 });
          audioCtxRef.current = audioCtx;

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const source = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          source.connect(processor);
          processor.connect(audioCtx.destination);

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
              ws.send(JSON.stringify({ audio: base64 }));
            }
          };

          nextStartTimeRef.current = 0;
        } catch (err: any) {
          setError(err.message || 'Failed to access microphone');
          disconnect();
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          setError(msg.error);
          disconnect();
          return;
        }
        if (msg.audio && audioCtxRef.current) {
          playAudioChunk(audioCtxRef.current, msg.audio);
        }
        if (msg.interrupted) {
          // Clear queue by advancing the start time
          nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
        }
      };

      ws.onclose = () => {
        disconnect();
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
        disconnect();
      };
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setIsConnecting(false);
    }
  };

  const playAudioChunk = (audioCtx: AudioContext, base64: string) => {
    const pcm = base64ToPcm(base64);
    // Gemini Live API typically returns audio at 24kHz
    const buffer = audioCtx.createBuffer(1, pcm.length, 24000);
    buffer.getChannelData(0).set(pcm);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const currentTime = audioCtx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05; // 50ms buffer to prevent crackling
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full px-6 py-12 bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <Globe2 className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-semibold text-gray-900 mb-2 tracking-tight">Live Voice Translator</h1>
        <p className="text-gray-500 mb-6 max-w-[280px]">
          Speak English and hear {targetLang}, or speak {targetLang} and hear English.
        </p>

        <div className="mb-8 w-full max-w-[200px]">
          <select 
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            disabled={isConnected || isConnecting}
            className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-colors"
          >
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Italian">Italian</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Chinese (Mandarin)">Chinese (Mandarin)</option>
            <option value="Russian">Russian</option>
            <option value="Arabic">Arabic</option>
            <option value="Hindi">Hindi</option>
          </select>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-8 text-sm flex items-start gap-2 w-full text-left"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          {/* Pulsing background when connected */}
          {isConnected && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 bg-blue-400 rounded-full -z-10"
              />
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                className="absolute inset-0 bg-blue-300 rounded-full -z-10"
              />
            </>
          )}

          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`
              relative w-24 h-24 rounded-full flex items-center justify-center
              transition-all duration-300 shadow-lg text-white group
              ${isConnected 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-200 focus:ring-4 focus:ring-red-100' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 focus:ring-4 focus:ring-blue-100'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            aria-label={isConnected ? "Stop translating" : "Start translating"}
          >
            {isConnecting ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : isConnected ? (
              <Square className="w-10 h-10 fill-current group-hover:scale-110 transition-transform" />
            ) : (
              <Mic className="w-10 h-10 group-hover:scale-110 transition-transform" />
            )}
          </button>
        </div>

        <p className="mt-8 text-sm font-medium transition-colors duration-300">
          {isConnecting && <span className="text-gray-500">Connecting...</span>}
          {isConnected && <span className="text-blue-600">Translation active. Start speaking.</span>}
          {!isConnecting && !isConnected && <span className="text-gray-500">Tap the mic to start</span>}
        </p>

        <div className="mt-12 text-xs text-gray-400 space-y-1">
          <p>Make sure your microphone is enabled.</p>
          <p>Powered by Gemini Live API</p>
        </div>
      </div>
    </div>
  );
}
