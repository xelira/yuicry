type Props = {
  title: string;
  text: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export default function EmptyState({ title, text, action }: Props) {
  return (
    <div className="mt-8 flex max-w-[460px] flex-col items-start gap-2 rounded-2xl border border-line bg-bg/70 p-6">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 rounded-md bg-accent px-3.5 py-2 text-[12px] font-medium text-accentText transition hover:brightness-110"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
