// Lucide has no Facebook/Google brand glyphs — these are the actual logo
// marks so a lead's source reads at a glance in the Leads table, instead of
// a generic dot or just text.
export function FacebookIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M15.5 12.5h-2v7h-2.9v-7H9v-2.5h1.6V8.3c0-1.6.9-2.8 2.9-2.8h2v2.5h-1.4c-.4 0-.7.3-.7.8v1.2h2.3l-.2 2.5Z"
      />
    </svg>
  )
}

export function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22 12.23c0-.73-.07-1.43-.2-2.1H12v4.26h5.62c-.24 1.3-.98 2.4-2.1 3.14v2.6h3.4c1.98-1.83 3.08-4.52 3.08-7.9Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.4-2.6c-.94.63-2.15 1-3.22 1-2.48 0-4.58-1.67-5.33-3.92H3.16v2.46A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.67 13.05A5.9 5.9 0 0 1 6.36 12c0-.37.06-.73.17-1.05V8.5H3.16A10 10 0 0 0 2 12c0 1.6.38 3.1 1.16 4.5l3.51-2.45Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.58c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 3.47 14.7 2.5 12 2.5a10 10 0 0 0-8.84 5.4l3.51 2.45c.75-2.25 2.85-3.77 5.33-3.77Z"
      />
    </svg>
  )
}

export function InstagramIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)" />
      <rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="16.1" cy="7.9" r="0.9" fill="#fff" />
    </svg>
  )
}
