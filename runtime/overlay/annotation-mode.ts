import { getStableSelector } from './selector.ts';
import { showPopover, showToast, isPopoverActive } from './popover.ts';
import { postAnnotation } from './api-client.ts';
import { addAnnotation, getState, subscribe } from './state.ts';
import type { AnnotationInput } from '../types/session.ts';

export function mountAnnotationMode(_root: HTMLElement): void {
  let outline: HTMLDivElement | null = null;
  let currentEl: Element | null = null;
  let pointerDown: { x: number; y: number } | null = null;

  const onMouseMove = (e: MouseEvent) => {
    if (getState().mode !== 'annotating') return;
    const el = pickTarget(e.target as Element);
    if (!el || el === currentEl) return;
    currentEl = el;
    drawOutline(el);
  };

  const onClick = (e: MouseEvent) => {
    if (getState().mode !== 'annotating') return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (pointerDown) {
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      if (Math.hypot(dx, dy) > 8) return;
    }
    // If a popover is already open, do not start another annotation — the
    // popover singleton would close the first one and the user would lose
    // their in-progress comment.
    if (isPopoverActive()) return;
    const el = pickTarget(e.target as Element);
    if (!el) return;
    e.stopPropagation();
    e.preventDefault();
    void captureAnnotation(el);
  };

  // capture phase so we run before reveal.js
  document.addEventListener('pointerdown', (e) => {
    pointerDown = { x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);

  subscribe(s => {
    if (s.mode !== 'annotating' && outline) {
      outline.remove();
      outline = null;
      currentEl = null;
    }
  });

  function pickTarget(el: Element | null): Element | null {
    if (!el) return null;
    if (el.closest('.deckmark-toolbar, .deckmark-popover, .deckmark-pin, .deckmark-done-dialog'))
      return null;
    if (el.closest('.controls, .progress, .slide-number, .speaker-notes, [data-prevent-swipe]'))
      return null;
    const section = el.closest('section');
    if (!section) return null;
    if (el === section) return section.firstElementChild ?? section;
    return el;
  }

  function drawOutline(el: Element): void {
    const rect = el.getBoundingClientRect();
    if (!outline) {
      outline = document.createElement('div');
      outline.className = 'deckmark-hover-outline';
      document.body.appendChild(outline);
    }
    outline.style.left = `${window.scrollX + rect.left}px`;
    outline.style.top = `${window.scrollY + rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  }

  async function captureAnnotation(el: Element): Promise<void> {
    const rect = el.getBoundingClientRect();
    const { selector, dom_path } = getStableSelector(el);
    const section = el.closest('section') as HTMLElement | null;
    const slideIndex = parseInt(section?.dataset.slideIndex ?? '0', 10);
    const slideId = section?.id || null;
    const slideTitle = section?.dataset.slideTitle || null;

    const popResult = await showPopover({
      selector,
      tag: el.tagName.toLowerCase(),
      bbox: rect
    });
    if (!popResult.comment) return;

    const payload: AnnotationInput = {
      slide: { index: slideIndex, id: slideId, title: slideTitle },
      element: {
        selector,
        dom_path,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 200),
        bbox: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
      },
      comment: popResult.comment
    };
    try {
      const a = await postAnnotation(payload);
      addAnnotation(a);
      showToast('✓ Annotation saved');
    } catch (e) {
      console.error('deckmark: post annotation failed', e);
      showToast('⚠ Save failed — see console');
    }
  }
}
