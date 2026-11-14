type Props = {
  size?: number;
  className?: string;
};

export default function AssistantIcon({ size = 20, className }: Props) {
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
        d="M12 3.2a8.8 8.8 0 1 1-6.2 2.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M8.7 10.4v3.2M11.2 8.4v7.2M13.7 9.8v4.4M16.2 10.8v2.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="18.4" cy="5.6" r="1.4" fill="currentColor" />
    </svg>
  );
}
