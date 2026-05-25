import { postClose } from './api-client.ts';

export function mountDoneDialog(_root: HTMLElement): () => void {
  return open;

  function open(): void {
    const wrap = document.createElement('div');
    wrap.className = 'deckmark-done-dialog';
    wrap.innerHTML = `
      <div class="card">
        <h2>Send annotations to your agent?</h2>
        <p>Optional overall summary:</p>
        <textarea placeholder="e.g., love it, just feels too corporate"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-cancel>Cancel</button>
          <button type="button" class="primary" data-confirm>Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();
    const cleanup = () => wrap.remove();

    wrap.querySelector('[data-cancel]')!.addEventListener('click', cleanup);
    wrap.querySelector('[data-confirm]')!.addEventListener('click', async () => {
      const summary = ta.value.trim() || null;
      try {
        await postClose(summary);
        wrap.innerHTML = `
          <div class="card">
            <h2>✓ Sent to agent</h2>
            <p>You can close this tab and return to your terminal.</p>
          </div>
        `;
      } catch (e) {
        alert('Failed to send. Check the console.');
        console.error(e);
        cleanup();
      }
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) cleanup();
    });
  }
}
