import { getState, setMode, subscribe } from './state.ts';
import { showHelpDialog } from './help-dialog.ts';

export function mountToolbar(root: HTMLElement, onDone: () => void): void {
  const bar = document.createElement('div');
  bar.className = 'deckmark-toolbar';
  bar.dataset.mode = 'idle';
  bar.innerHTML = `
    <span class="deckmark-count" data-count role="status" aria-live="polite" aria-label="Annotations on current slide: 0"><span aria-hidden="true">💬</span> <span data-count-value>0</span></span>
    <button type="button" data-action="annotate" aria-label="Enter annotation mode"><span aria-hidden="true">🖱</span> Annotate</button>
    <button type="button" data-action="hide" aria-label="Hide overlay"><span aria-hidden="true">👁</span> Hide</button>
    <button type="button" data-action="done" aria-label="Finish and send annotations"><span aria-hidden="true">✓</span> Done</button>
    <button type="button" data-action="help" title="How does this work?" aria-label="Show help">?</button>
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
    const countEl = bar.querySelector('[data-count]')!;
    const valueEl = countEl.querySelector('[data-count-value]')!;
    valueEl.textContent = String(count);
    countEl.setAttribute('aria-label', `Annotations on current slide: ${count}`);
  });
}
