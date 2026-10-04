import { useUi } from './useStore.ts';
import { ErrorScreen, LoadingScreen, PauseOverlay, StartScreen, TeleportMenu } from './Screens.tsx';
import { Hud } from './Hud.tsx';
import { DebugPanel, Toasts } from './Toasts.tsx';

export function App() {
  const screen = useUi((s) => s.screen);
  const inGame = screen === 'playing' || screen === 'paused' || screen === 'menu';
  return (
    <div className="ui-root" data-screen={screen}>
      {inGame && <Hud />}
      {screen === 'start' && <StartScreen />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'paused' && <PauseOverlay />}
      {screen === 'menu' && <TeleportMenu />}
      {screen === 'error' && <ErrorScreen />}
      <Toasts />
      <DebugPanel />
    </div>
  );
}
