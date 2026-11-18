// Sentiment Interpreter logo: a speech bubble holding the sentiment bar (red to green) and a sound wave,
// on a violet-to-cyan tile. A sibling of the Sentiment Translator mark.
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="si-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="si-bar" x1="0" x2="1">
          <stop offset="0" stopColor="#f87171" />
          <stop offset="0.5" stopColor="#facc15" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#si-tile)" />
      <rect x="2.5" y="2.5" width="43" height="43" rx="12.5" fill="none" stroke="#fff" strokeOpacity="0.35" />
      <path d="M13 11.5h22a4.5 4.5 0 0 1 4.5 4.5v12a4.5 4.5 0 0 1-4.5 4.5H20l-6.5 5v-5H13A4.5 4.5 0 0 1 8.5 28V16A4.5 4.5 0 0 1 13 11.5z"
        fill="#fff" fillOpacity="0.16" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="14" y="16" width="20" height="3" rx="1.5" fill="url(#si-bar)" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <path d="M15 25v2" /><path d="M19.5 23v6" /><path d="M24 21.5v9" /><path d="M28.5 23.5v5" /><path d="M33 25v2" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <h1 className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
      <LogoMark className="w-11 h-11 sm:w-14 sm:h-14 drop-shadow-[0_6px_18px_rgba(139,92,246,0.35)]" />
      <span className="font-logo text-[28px] sm:text-5xl tracking-tight leading-none whitespace-nowrap">
        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-sky-500 to-cyan-500 dark:from-violet-300 dark:via-sky-300 dark:to-cyan-300">
          Sentiment
        </span>{' '}
        <span className="font-light text-slate-700 dark:text-slate-200">Interpreter</span>
      </span>
    </h1>
  );
}
