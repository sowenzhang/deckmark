import type { Annotation, AnnotationInput, AnnotationSession } from '../types/session.ts';

export async function fetchState(): Promise<AnnotationSession> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`fetch state: ${res.status}`);
  return res.json();
}

export async function postAnnotation(a: AnnotationInput): Promise<Annotation> {
  const res = await fetch('/api/annotations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(a)
  });
  if (!res.ok) throw new Error(`post annotation: ${res.status}`);
  return res.json();
}

export async function postClose(summary: string | null): Promise<void> {
  const res = await fetch('/api/close', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary })
  });
  if (!res.ok) throw new Error(`post close: ${res.status}`);
}
