// mcp/tools/annotations.ts
import { resolve } from 'node:path';
import { readSession } from '../../runtime/store/session-store.ts';
import type { AnnotationSession } from '../../runtime/types/session.ts';

interface GetInput {
  dir?: string;
  session_id?: string;
  format?: 'json' | 'md';
  unresolved_only?: boolean;
}

export const getAnnotationsTool = {
  name: 'get_annotations',
  description:
    'Read annotations for a session from disk. Use when the user says "address the annotations" or similar — works even if Done was not clicked.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string' },
      session_id: { type: 'string', description: 'Defaults to latest' },
      format: { type: 'string', enum: ['json', 'md'], default: 'md' },
      unresolved_only: { type: 'boolean', default: false }
    }
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as GetInput;
    const deckDir = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
    const sessionId = opts.session_id && opts.session_id !== 'latest' ? opts.session_id : undefined;
    const session = await readSession({ deckDir, sessionId });
    let annotations = session.annotations;
    if (opts.unresolved_only) {
      annotations = annotations.filter(a => a.status !== 'resolved');
    }
    const filtered = { ...session, annotations };
    if (opts.format === 'json') {
      return filtered;
    }
    return { format: 'md', text: renderMarkdown(filtered), session_id: session.session_id, closed: session.closed };
  }
};

function renderMarkdown(s: AnnotationSession): string {
  const lines: string[] = [];
  lines.push(`# Annotations — session ${s.session_id}`);
  lines.push('');
  lines.push(`- closed: ${s.closed}`);
  if (s.summary) lines.push(`- summary: ${s.summary}`);
  lines.push(`- build_hash: ${s.build_hash}`);
  lines.push('');
  s.annotations.forEach((a, i) => {
    const bbox = a.element.bbox;
    lines.push(
      `## [${i + 1}] Slide ${a.slide.index}${a.slide.title ? ` — ${a.slide.title}` : ''}  ` +
      `\`${a.element.selector}\`  (x=${Math.round(bbox.x)}, y=${Math.round(bbox.y)}, ` +
      `w=${Math.round(bbox.w)}, h=${Math.round(bbox.h)})  [${a.status}]`
    );
    lines.push('');
    lines.push(`> ${a.comment.replace(/\n/g, '\n> ')}`);
    if (a.element.text) {
      lines.push('');
      lines.push(`Element text: "${a.element.text.slice(0, 100)}"`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
