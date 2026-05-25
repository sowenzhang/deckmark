import type { Annotation, AnnotationSession } from '../types/session.ts';

export type OverlayMode = 'idle' | 'annotating' | 'hidden';

export interface OverlayState {
  mode: OverlayMode;
  session: AnnotationSession | null;
  currentSlideIndex: number;
}

type Listener = (s: OverlayState) => void;

const state: OverlayState = {
  mode: 'idle',
  session: null,
  currentSlideIndex: 0
};

const listeners = new Set<Listener>();

export function getState(): OverlayState {
  return state;
}

export function setMode(mode: OverlayMode): void {
  state.mode = mode;
  emit();
}

export function setSession(session: AnnotationSession): void {
  state.session = session;
  emit();
}

export function setCurrentSlide(i: number): void {
  state.currentSlideIndex = i;
  emit();
}

export function addAnnotation(a: Annotation): void {
  if (!state.session) return;
  state.session.annotations.push(a);
  emit();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function emit(): void {
  for (const l of listeners) l(state);
}
