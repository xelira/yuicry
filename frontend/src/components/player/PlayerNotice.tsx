type Props = {
  message: string;
};

export default function PlayerNotice({ message }: Props) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-accent px-4 py-1 text-center text-[11px] font-medium text-accentText"
    >
      {message}
    </div>
  );
}
