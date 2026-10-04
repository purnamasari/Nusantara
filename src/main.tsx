import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore } from './bridge/store.ts';
import { initialUiState } from './bridge/uiState.ts';
import { Game } from './engine/Game.ts';
import { App } from './ui/App.tsx';
import { CommandsContext, StoreContext } from './ui/useStore.ts';
import './ui/styles.css';

const store = createStore(initialUiState);
const game = new Game(store, document.getElementById('game')!, import.meta.env.BASE_URL);

if (__TEST_HOOKS__) {
  void import('./engine/testHooks.ts').then((m) => m.installTestHooks(game));
}

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <CommandsContext.Provider value={game.commands}>
        <App />
      </CommandsContext.Provider>
    </StoreContext.Provider>
  </StrictMode>,
);

game.boot();
