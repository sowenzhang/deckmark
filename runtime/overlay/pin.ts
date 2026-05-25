import { getState, subscribe } from './state.ts';
import type { Annotation } from '../types/session.ts';

export function mountPins(_root: HTMLElement): void {
  const layer = document.createElement('div');
  layer.id = 'deckmark-pins';
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '999997'
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(layer);

  const render = () => {
    const s = getState();
    layer.innerHTML = '';
    if (s.mode === 'hidden' || !s.session) return;
    const onCurrent = s.session.annotations.filter(a => a.slide.index === s.currentSlideIndex);
    for (let i = 0; i < onCurrent.length; i++) {
      placePin(layer, onCurrent[i], i + 1);
    }
  };

  subscribe(render);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', render, true);
  render();
}

function placePin(layer: HTMLElement, a: Annotation, num: number): void {
  let target: Element | null = null;
  try {
    target = document.querySelector(a.element.selector);
  } catch {
    target = null;
  }
  if (!target) return; // stale selector — skip (v2 could re-anchor via bbox)
  const rect = target.getBoundingClientRect();
  const pin = document.createElement('div');
  pin.className = 'deckmark-pin';
  pin.dataset.status = a.status;
  pin.textContent = String(num);
  pin.title = a.comment;
  pin.style.left = `${window.scrollX + rect.left - 12}px`;
  pin.style.top = `${window.scrollY + rect.top - 12}px`;
  pin.style.pointerEvents = 'auto';
  pin.addEventListener('click', () => {
    alert(`Annotation #${num}\n\n${a.comment}`);
  });
  layer.appendChild(pin);
}
