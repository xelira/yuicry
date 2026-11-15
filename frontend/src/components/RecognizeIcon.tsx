type Props = {
  size?: number;
  className?: string;
};

export default function RecognizeIcon({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.2 12a7.8 7.8 0 0 1 7.8-7.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7.2 12a4.8 4.8 0 0 1 4.8-4.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10.2 12a1.8 1.8 0 0 1 1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16.1 13.9V9.2l4-1.1v4.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="14.8" cy="15" r="1.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18.8" cy="13.9" r="1.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
