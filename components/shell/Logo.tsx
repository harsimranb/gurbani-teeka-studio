/** Eko mark: two circles (ring and dot). */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="#B8640A" strokeWidth="2" />
      <circle cx="13" cy="13" r="3.5" fill="#B8640A" />
    </svg>
  );
}
