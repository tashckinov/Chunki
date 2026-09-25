import { useState } from 'react';

/**
 * A boolean that flips to `true` and resets to `false` after `ms` — the
 * "Скопировано!" / "Сохранено" flash shared by every copy-to-clipboard and
 * just-saved indicator in the admin UI.
 */
export function useTimedFlag(ms = 1500): [boolean, () => void] {
  const [flag, setFlag] = useState(false);

  function trigger() {
    setFlag(true);
    setTimeout(() => setFlag(false), ms);
  }

  return [flag, trigger];
}
