export interface PopoverResult {
  comment: string | null;
}

let activePopover: HTMLDivElement | null = null;

export function isPopoverActive(): boolean {
  return activePopover !== null;
}

export function showPopover(
  target: { selector: string; tag: string; bbox: DOMRect }
): Promise<PopoverResult> {
  return new Promise((resolve) => {
    // Singleton: if a popover is already open, close it (treat as cancel) before opening the new one.
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }

    const pop = document.createElement('div');
    pop.className = 'deckmark-popover';
    pop.style.left = `${window.scrollX + target.bbox.left}px`;
    pop.style.top = `${window.scrollY + target.bbox.bottom + 8}px`;
    pop.innerHTML = `
      <div class="target">${escape(target.tag)} — ${escape(target.selector)}</div>
      <textarea placeholder="What should change?" autofocus></textarea>
      <div class="actions">
        <button type="button" class="secondary" data-cancel>Cancel</button>
        <button type="button" class="primary" data-submit>Submit</button>
      </div>
    `;
    document.body.appendChild(pop);
    activePopover = pop;

    const ta = pop.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();

    let resolved = false;
    let removeOutsideListener: (() => void) | null = null;
    const cleanup = () => {
      if (removeOutsideListener) {
        removeOutsideListener();
        removeOutsideListener = null;
      }
      if (activePopover === pop) activePopover = null;
      pop.remove();
    };
    const submit = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (resolved) return;
      resolved = true;
      const text = ta.value.trim();
      cleanup();
      resolve({ comment: text || null });
    };
    const cancel = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ comment: null });
    };

    // Use both click and pointerdown to be resilient to mouse vs touch and to
    // race conditions where another handler eats the click event.
    const submitBtn = pop.querySelector('[data-submit]') as HTMLButtonElement;
    const cancelBtn = pop.querySelector('[data-cancel]') as HTMLButtonElement;
    submitBtn.addEventListener('click', submit);
    submitBtn.addEventListener('pointerdown', submit);
    cancelBtn.addEventListener('click', cancel);
    cancelBtn.addEventListener('pointerdown', cancel);

    const onOutsidePointerDown = (e: PointerEvent) => {
      const targetEl = e.target as Node | null;
      if (targetEl && !pop.contains(targetEl)) cancel(e);
    };
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    removeOutsideListener = () => {
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    };

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancel();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
    });
  });
}

/** Brief floating toast — used to confirm a successful save. */
export function showToast(text: string, ms = 1800): void {
  const toast = document.createElement('div');
  toast.className = 'deckmark-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  // trigger transition
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 240);
  }, ms);
}

function escape(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
