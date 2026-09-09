export function Spinner({ size = 44, borderWidth = 3 }: { size?: number; borderWidth?: number }) {
  return (
    <div
      className="flex-none rounded-full border-surface-subtle anim-spin"
      style={{ width: size, height: size, borderWidth, borderTopColor: 'var(--color-accent)' }}
    />
  );
}
