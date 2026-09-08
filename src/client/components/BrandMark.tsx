export function BrandMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark__svg"
      fill="none"
      height={size}
      viewBox="0 0 34 34"
      width={size}
    >
      <circle
        cx="17"
        cy="17"
        r="12.5"
        stroke="currentColor"
        strokeDasharray="2.4 2.8"
        strokeWidth="1"
      />
      <circle cx="17" cy="4.5" fill="currentColor" r="1.4" />
      <path
        d="M17 10.2 18.3 15.2 23.4 16.5 18.3 17.8 17 22.8 15.7 17.8 10.6 16.5 15.7 15.2Z"
        fill="currentColor"
      />
    </svg>
  )
}
