import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnnotationSession, AnnotationInput, Annotation } from '../types/session.ts';

function sessionId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const suffix = randomUUID().slice(0, 8);
  return `${ts}-${suffix}`;
}

function sessionPath(deckDir: string, id: string): string {
  return join(deckDir, 'annotations', `session-${id}.json`);
}

function latestPath(deckDir: string): string {
  return join(deckDir, 'annotations', 'session-latest.json');
}

const writeLocks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeLocks.set(key, next.catch(() => {}));
  return next;
}

async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, path);
}

async function writeSession(deckDir: string, session: AnnotationSession): Promise<void> {
  await mkdir(join(deckDir, 'annotations'), { recursive: true });
  const json = JSON.stringify(session, null, 2);
  await atomicWrite(sessionPath(deckDir, session.session_id), json);
  await atomicWrite(latestPath(deckDir), json);
}

export async function createSession(opts: {
  deckDir: string;
  engine: string;
  buildHash: string;
  previousSessionId?: string | null;
}): Promise<AnnotationSession> {
  const id = sessionId();
  const session: AnnotationSession = {
    schema: 'deckmark/annotation-session/v1',
    session_id: id,
    created_at: new Date().toISOString(),
    closed: false,
    closed_at: null,
    deck_dir: opts.deckDir,
    engine: opts.engine,
    build_hash: opts.buildHash,
    previous_session_id: opts.previousSessionId ?? null,
    summary: null,
    annotations: []
  };
  await withLock(opts.deckDir, () => writeSession(opts.deckDir, session));
  return session;
}

export async function readSession(opts: {
  deckDir: string;
  sessionId?: string;
}): Promise<AnnotationSession> {
  const path = opts.sessionId
    ? sessionPath(opts.deckDir, opts.sessionId)
    : latestPath(opts.deckDir);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as AnnotationSession;
}

export async function appendAnnotation(opts: {
  deckDir: string;
  sessionId: string;
  annotation: AnnotationInput;
}): Promise<Annotation> {
  return withLock(opts.deckDir, async () => {
    const current = await readSession({ deckDir: opts.deckDir, sessionId: opts.sessionId });
    const a: Annotation = {
      id: `anno-${randomUUID().slice(0, 8)}`,
      created_at: new Date().toISOString(),
      slide: opts.annotation.slide,
      element: opts.annotation.element,
      comment: opts.annotation.comment,
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      screenshot: opts.annotation.screenshot ?? null
    };
    current.annotations.push(a);
    await writeSession(opts.deckDir, current);
    return a;
  });
}

export async function closeSession(opts: {
  deckDir: string;
  sessionId: string;
  summary?: string | null;
}): Promise<AnnotationSession> {
  return withLock(opts.deckDir, async () => {
    const current = await readSession({ deckDir: opts.deckDir, sessionId: opts.sessionId });
    current.closed = true;
    current.closed_at = new Date().toISOString();
    if (opts.summary !== undefined) current.summary = opts.summary;
    await writeSession(opts.deckDir, current);
    return current;
  });
}

export async function listSessions(deckDir: string): Promise<string[]> {
  try {
    const files = await readdir(join(deckDir, 'annotations'));
    return files
      .filter(f => f.startsWith('session-') && f.endsWith('.json') && !f.includes('latest'))
      .map(f => f.replace(/^session-/, '').replace(/\.json$/, ''))
      .sort();
  } catch {
    return [];
  }
}
