import { getState, subscribe } from './state.ts';
import type { Annotation } from '../types/session.ts';

export function mountPins(_root: HTMLElement): void {
  const render = () => {
    const s = getState();
    clearPinLayers();
    if (s.mode === 'hidden' || !s.session) return;
    const onCurrent = s.session.annotations.filter(a => a.slide.index === s.currentSlideIndex);
    const currentSection = document.querySelector<HTMLElement>(`section[data-slide-index="${s.currentSlideIndex}"]`);
    if (!currentSection) return;
    const layer = ensureSlideLayer(currentSection);
    for (let i = 0; i < onCurrent.length; i++) {
      placePin(layer, currentSection, onCurrent[i], i + 1);
    }
  };

  subscribe(render);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', render, true);
  render();
}

function placePin(layer: HTMLElement, section: HTMLElement, a: Annotation, num: number): void {
  let target: Element | null = null;
  try {
    target = document.querySelector(a.element.selector);
  } catch {
    target = null;
  }
  if (!target) return; // stale selector — skip (v2 could re-anchor via bbox)
  const rect = target.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const scaleX = section.offsetWidth > 0 ? sectionRect.width / section.offsetWidth : 1;
  const scaleY = section.offsetHeight > 0 ? sectionRect.height / section.offsetHeight : 1;
  const unscaledX = Number.isFinite(scaleX) && scaleX > 0 ? (rect.left - sectionRect.left) / scaleX : rect.left - sectionRect.left;
  const unscaledY = Number.isFinite(scaleY) && scaleY > 0 ? (rect.top - sectionRect.top) / scaleY : rect.top - sectionRect.top;
  const pin = document.createElement('div');
  pin.className = 'deckmark-pin';
  pin.dataset.status = a.status;
  pin.textContent = String(num);
  pin.title = a.comment;
  pin.style.left = `${unscaledX - 12}px`;
  pin.style.top = `${unscaledY - 12}px`;
  pin.style.pointerEvents = 'auto';
  pin.addEventListener('click', () => {
    alert(`Annotation #${num}\n\n${a.comment}`);
  });
  layer.appendChild(pin);
}

function clearPinLayers(): void {
  document.querySelectorAll<HTMLElement>('.deckmark-pin-layer').forEach(layer => layer.remove());
}

function ensureSlideLayer(section: HTMLElement): HTMLElement {
  if (getComputedStyle(section).position === 'static') {
    section.style.position = 'relative';
  }
  const layer = document.createElement('div');
  layer.className = 'deckmark-pin-layer';
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '999997'
  } as Partial<CSSStyleDeclaration>);
  section.appendChild(layer);
  return layer;
}
