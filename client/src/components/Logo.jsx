export default function Logo({ size = 32 }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb84d" />
            <stop offset="1" stopColor="#2ee6d6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#10131a" stroke="rgba(255,255,255,.1)" />
        <path d="M14 18h6l5 22h20l5-15H23" fill="none" stroke="url(#lg-logo)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="48" r="3.5" fill="#ffb84d" />
        <circle cx="43" cy="48" r="3.5" fill="#2ee6d6" />
      </svg>
      <span className="font-display font-bold text-lg tracking-tight">
        Pal<span className="text-saffron-400">Procure</span>
      </span>
    </span>
  );
}
