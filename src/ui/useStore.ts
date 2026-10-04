import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Store } from '../bridge/store.ts';
import type { GameCommands, UiState } from '../bridge/uiState.ts';

export const StoreContext = createContext<Store<UiState> | null>(null);
export const CommandsContext = createContext<GameCommands | null>(null);

/** Subscribes to one slice; selectors must return primitives or stable references. */
export function useUi<T>(selector: (s: UiState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}

export function useCommands(): GameCommands {
  const c = useContext(CommandsContext);
  if (!c) throw new Error('CommandsContext missing');
  return c;
}
