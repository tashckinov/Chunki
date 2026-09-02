export function CheckingScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-11 h-11 rounded-full border-[3px] border-surface-subtle anim-spin" style={{ borderTopColor: 'var(--color-accent)' }} />
      <div className="text-[19px] font-medium text-center">{title}</div>
    </div>
  );
}
