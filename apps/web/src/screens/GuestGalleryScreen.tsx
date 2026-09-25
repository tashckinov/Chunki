import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { InteractiveWords } from '../components/InteractiveWords';
import { DialoguePlayback } from '../components/dialogue/DialoguePlayback';
import { Logo } from '../components/brand/Logo';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { AccountDialog } from '../components/ui/AccountRow';
import { GUEST_DIALOGUE_MESSAGES, GUEST_TARGET_TEXT, GUEST_SITUATION_TEXT, GUEST_SAMPLE_ANSWER } from '../lib/guestPreview';

/**
 * What an unauthenticated visitor sees instead of the real app — a static
 * (non-interactive) look at a couple of real screens' content, built from
 * the same components the logged-in app uses (DialoguePlayback,
 * InteractiveWords), just fed hardcoded sample data instead of a real
 * session. Replaces the whole screen tree for a confirmed-logged-out
 * visitor (see App.tsx's CurrentScreen), so there's no nav chrome around
 * it and nothing here can navigate anywhere except the login dialog.
 */
export function GuestGalleryScreen() {
  const interfaceMode = useAppStore((s) => s.interfaceMode);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="scroll-clean flex-1 min-h-0 px-5 py-8 flex flex-col gap-9">
      <div className="flex flex-col items-center gap-3 text-center pt-4">
        <Logo size={40} />
        <div className="text-page-title">Chunki</div>
        <div className="text-body-secondary max-w-[420px]">
          Изучайте английский через готовые фразы: комиксы, живые диалоги и упражнения на собственные ответы.
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-section-title">Комиксы</div>
        <Card variant="surface" className="border border-border p-5 flex flex-col gap-4">
          <div className="text-body-secondary text-[13.5px] text-center">Посмотрите, как это звучит в живой речи</div>
          <DialoguePlayback messages={GUEST_DIALOGUE_MESSAGES} targetText={GUEST_TARGET_TEXT} />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-section-title">Печать ответа</div>
        <Card variant="surface" className="border border-border p-5 flex flex-col gap-4">
          <div>
            <div className="text-meta mb-2">Ситуация</div>
            <InteractiveWords
              parts={[]}
              interfaceMode={interfaceMode}
              fallbackText={GUEST_SITUATION_TEXT}
              textClassName="text-[17px] leading-[24px] font-medium not-italic"
              inactiveColorClassName="text-text"
            />
          </div>
          <Textarea value={GUEST_SAMPLE_ANSWER} onChange={() => {}} disabled rows={3} />
        </Card>
      </div>

      <div className="flex-1" />

      <Card variant="accent" className="p-6 flex flex-col gap-3 items-center text-center">
        <div className="text-[16px] font-semibold">Войдите, чтобы начать</div>
        <div className="text-body-secondary">Бесплатный вход через Google или Passkey — без пароля.</div>
        <Button size="lg" onClick={() => setAccountOpen(true)} className="w-full">
          Войти
        </Button>
      </Card>
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
