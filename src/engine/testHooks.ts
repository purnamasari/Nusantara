// Installed only in the e2e build (__TEST_HOOKS__); the production budget check fails if the
// hook name appears in the shipped bundle (plan §11.7).

import type { Game } from './Game.ts';

export function installTestHooks(game: Game): void {
  (window as unknown as Record<string, unknown>).__otherworld = game.testApi();
}
