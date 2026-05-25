export function showHelpDialog(): void {
  // Remove any existing instance first.
  document.querySelectorAll('.deckmark-help-dialog').forEach(n => n.remove());

  const wrap = document.createElement('div');
  wrap.className = 'deckmark-help-dialog';
  wrap.innerHTML = `
    <div class="card">
      <h2>How deckmark annotation works</h2>
      <ol>
        <li><strong>Press <kbd>A</kbd> or click Annotate</strong> to enter annotation mode. The toolbar pill turns blue.</li>
        <li><strong>Hover any slide element.</strong> A dashed blue outline shows what you'd be commenting on.</li>
        <li><strong>Click the element.</strong> A popover with a textarea opens below it.</li>
        <li><strong>Type your change request</strong>, then press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> or click Submit. A numbered pin appears on the element.</li>
        <li><strong>Repeat</strong> for any other elements. Each annotation is saved immediately to disk.</li>
        <li><strong>When done,</strong> click ✓ Done (or press <kbd>Shift</kbd>+<kbd>D</kbd>) and optionally leave a summary. Then return to your agent and say "apply the comments."</li>
      </ol>

      <h3>Shortcuts</h3>
      <table class="shortcuts">
        <tr><td><kbd>A</kbd></td><td>Toggle annotation mode</td></tr>
        <tr><td><kbd>H</kbd></td><td>Hide / show overlay (the slide stays interactive)</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>D</kbd></td><td>Open the Done dialog</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel the open popover / exit annotation mode</td></tr>
        <tr><td><kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Submit a comment</td></tr>
        <tr><td>← / →</td><td>Navigate slides (reveal.js)</td></tr>
      </table>

      <div class="actions">
        <button type="button" class="primary" data-close>Got it</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector('[data-close]')!.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  });
}
