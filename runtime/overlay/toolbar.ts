import { getState, setMode, subscribe } from './state.ts';
import { showHelpDialog } from './help-dialog.ts';

export function mountToolbar(root: HTMLElement, onDone: () => void): void {
  const bar = document.createElement('div');
  bar.className = 'deckmark-toolbar';
  bar.dataset.mode = 'idle';
  bar.innerHTML = `
    <span class="deckmark-count" data-count>💬 0</span>
    <button type="button" data-action="annotate">🖱 Annotate</button>
    <button type="button" data-action="hide">👁 Hide</button>
    <button type="button" data-action="done">✓ Done</button>
    <button type="button" data-action="help" title="How does this work?" aria-label="Help">?</button>
  `;
  root.appendChild(bar);

  bar.querySelector('[data-action="annotate"]')!.addEventListener('click', () => {
    const m = getState().mode;
    setMode(m === 'annotating' ? 'idle' : 'annotating');
  });
  bar.querySelector('[data-action="hide"]')!.addEventListener('click', () => {
    setMode(getState().mode === 'hidden' ? 'idle' : 'hidden');
  });
  bar.querySelector('[data-action="done"]')!.addEventListener('click', onDone);
  bar.querySelector('[data-action="help"]')!.addEventListener('click', showHelpDialog);

  subscribe(s => {
    bar.dataset.mode = s.mode;
    const count = (s.session?.annotations ?? []).filter(
      a => a.slide.index === s.currentSlideIndex
    ).length;
    bar.querySelector('[data-count]')!.textContent = `💬 ${count}`;
  });
}
