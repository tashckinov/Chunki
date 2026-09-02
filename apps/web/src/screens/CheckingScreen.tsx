export function CheckingScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-14 h-14 rounded-full border-4 border-surface-container-highest anim-spin" style={{ borderTopColor: 'var(--md-primary)' }} />
      <div className="text-[22px] leading-7 text-center">{title}</div>
    </div>
  );
}
