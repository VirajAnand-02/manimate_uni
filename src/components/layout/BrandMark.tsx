/** Compass-and-arc mark: a struck arc, its radius, and the pivot point. */
export default function BrandMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path d="M 6.5 26 A 15 15 0 0 1 20 5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <path d="M 34 20 A 14 14 0 0 1 24 33.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.6" />
      <line x1="20" y1="20" x2="20" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <circle cx="20" cy="20" r="2.75" fill="currentColor" />
      <circle cx="20" cy="5" r="1.75" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
