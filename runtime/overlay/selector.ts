// unique-selector is a CommonJS package whose source does:
//   exports.default = unique;   exports.__esModule = true;
// esbuild's CJS->ESM interop puts the entire `exports` object on the default
// binding here, so `import unique from 'unique-selector'` is the object, not
// the function. Unwrap it explicitly.
import uniqueModule from 'unique-selector';

type UniqueFn = (el: Element, options?: { selectorTypes?: string[] }) => string;

const unique: UniqueFn =
  typeof uniqueModule === 'function'
    ? (uniqueModule as unknown as UniqueFn)
    : ((uniqueModule as { default?: UniqueFn }).default as UniqueFn);

export interface StableSelector {
  selector: string;
  dom_path: string;
}

export function getStableSelector(el: Element): StableSelector {
  // unique-selector's valid types: ID, Class, Tag, NthChild, Attributes (covers data-*).
  // Order = priority; Attributes is preferred over Class so data-slide-index etc.
  // produce stable selectors even when classes drift.
  const selector = unique(el, {
    selectorTypes: ['ID', 'Attributes', 'Class', 'Tag', 'NthChild']
  });
  const dom_path = computeDomPath(el);
  return { selector, dom_path };
}

function computeDomPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && parts.length < 6) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) part += `#${cur.id}`;
    else if (cur.classList.length) part += `.${cur.classList[0]}`;
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}
