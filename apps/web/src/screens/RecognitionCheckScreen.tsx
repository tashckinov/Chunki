import { useAppStore } from '../store/appStore';
import { IconButton } from '../components/ui/IconButton';
import { ExerciseOption } from '../components/ui/ExerciseOption';

const LETTERS = ['A', 'B', 'C', 'D'];

export function RecognitionCheckScreen() {
  const s = useAppStore();
  const answered = s.recognitionResult !== null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-3 pt-2">
        <IconButton icon="Close" label="Закрыть" onClick={s.back} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-6 px-6 py-6">
        <div>
          <div className="text-meta mb-2">Что значит эта фраза?</div>
          <div className="text-[26px] leading-[32px] font-medium">{s.recognitionPrompt}</div>
        </div>

        <div className="flex flex-col gap-2.5">
          {s.recognitionOptions.map((option, i) => (
            <ExerciseOption
              key={option.id}
              letter={LETTERS[i]}
              selected={option.id === s.recognitionSelectedId}
              onClick={() => !answered && void s.answerRecognitionCheck(option.id)}
            >
              {option.label}
            </ExerciseOption>
          ))}
        </div>

        {answered && (
          <div className={`text-[15px] font-medium anim-rise ${s.recognitionResult ? 'text-positive' : 'text-negative'}`}>
            {s.recognitionResult ? 'Верно!' : 'Не совсем — но вы уже знакомы с этой фразой.'}
          </div>
        )}
      </div>
    </div>
  );
}
