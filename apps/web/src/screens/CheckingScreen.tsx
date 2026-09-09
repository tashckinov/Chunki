import { Spinner } from '../components/ui/Spinner';

export function CheckingScreen({ title }: { title: string }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 p-8">
      <Spinner size={44} />
      <div className="text-[19px] font-medium text-center">{title}</div>
    </div>
  );
}
