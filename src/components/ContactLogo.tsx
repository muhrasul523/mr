interface ContactLogoProps {
  className?: string;
}

export function ContactLogo({ className = 'h-8 w-8' }: ContactLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wdLogoBlue" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0A2463" />
          <stop offset="52%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="wdLogoAccent" x1="20" y1="16" x2="46" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DBEAFE" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#wdLogoBlue)" />
      <rect
        x="15"
        y="13"
        width="34"
        height="38"
        rx="7"
        fill="rgba(255,255,255,0.14)"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
      />
      <circle cx="32" cy="27" r="6.5" fill="url(#wdLogoAccent)" />
      <path
        d="M21.5 43.5C21.5 38.25 26.2 34.5 32 34.5C37.8 34.5 42.5 38.25 42.5 43.5"
        stroke="url(#wdLogoAccent)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <rect x="11" y="21" width="6" height="4.5" rx="2.2" fill="#38BDF8" />
      <rect x="11" y="30" width="6" height="4.5" rx="2.2" fill="#38BDF8" />
      <rect x="11" y="39" width="6" height="4.5" rx="2.2" fill="#F59E0B" />
    </svg>
  );
}
