// CSS is served via a <link> tag injected at runtime; no bundle-time import needed.
import { mountToolbar } from './toolbar.ts';
import { getState, setMode, setSession, setCurrentSlide } from './state.ts';
import { fetchState } from './api-client.ts';
import { mountAnnotationMode } from './annotation-mode.ts';
import { mountPins } from './pin.ts';
import { mountDoneDialog } from './done-dialog.ts';

declare global {
  interface Window {
    __deckmarkReveal?: {
      on: (event: string, handler: (e: { indexh: number }) => void) => void;
      getIndices: () => { h: number; v: number };
    };
  }
}

async function boot(): Promise<void> {
  const root = document.createElement('div');
  root.id = 'deckmark-root';
  document.body.appendChild(root);

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = '/overlay/styles.css';
  document.head.appendChild(styleLink);

  try {
    const session = await fetchState();
    setSession(session);
  } catch (e) {
    console.warn('deckmark: failed to load state', e);
  }

  const openDoneDialog = mountDoneDialog(root);
  mountToolbar(root, () => openDoneDialog());
  mountAnnotationMode(root);
  mountPins(root);

  const reveal = window.__deckmarkReveal;
  if (reveal) {
    setCurrentSlide(reveal.getIndices().h);
    reveal.on('slidechanged', (e) => setCurrentSlide(e.indexh ?? 0));
  }

  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
    if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      openDoneDialog();
      return;
    }
    if (e.key === 'a' || e.key === 'A') {
      setMode(getState().mode === 'annotating' ? 'idle' : 'annotating');
    }
    if (e.key === 'h' || e.key === 'H') {
      setMode(getState().mode === 'hidden' ? 'idle' : 'hidden');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void boot(); });
} else {
  void boot();
}
