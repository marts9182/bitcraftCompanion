/**
 * BitCraft Companion brand mark.
 *
 * A faceted gold hexagon (nods to hex tiles / Hexite) with a cut-gem inner
 * motif: a darker brass underside gives it a minted-coin feel, and a bright
 * highlight facet catches the light. Crisp at ~28-32px.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer hexagon — gold with a darker brass lower edge */}
      <path
        d="M16 1.5 27.6 8.25v15.5L16 30.5 4.4 23.75V8.25Z"
        fill="#D5BB72"
      />
      <path
        d="M16 30.5 27.6 23.75V8.25L16 15Z"
        fill="#B8932E"
      />
      {/* Inner faceted gem */}
      <path
        d="M16 8 23 12v8l-7 4-7-4v-8Z"
        fill="#1D1B22"
      />
      {/* Gem facets */}
      <path d="M16 8 23 12l-7 4-7-4Z" fill="#E9DFC4" fillOpacity="0.92" />
      <path d="M16 16 23 12v8Z" fill="#D5BB72" />
      <path d="M16 16 9 12v8Z" fill="#B8932E" />
      <path d="M16 16 9 20l7 4 7-4Z" fill="#8C6E1E" />
      {/* Bright top highlight facet */}
      <path d="M16 8 16 16 9 12Z" fill="#FFFFFF" fillOpacity="0.18" />
    </svg>
  );
}
