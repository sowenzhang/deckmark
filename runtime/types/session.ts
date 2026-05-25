export interface Slide {
  index: number;
  id: string | null;
  title: string | null;
}

export interface ElementInfo {
  selector: string;
  dom_path: string;
  tag: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface Annotation {
  id: string;
  created_at: string;
  slide: Slide;
  element: ElementInfo;
  comment: string;
  status: 'open' | 'resolved';
  resolved_by: 'agent' | 'user' | null;
  resolved_at: string | null;
  screenshot: string | null;
}

export type AnnotationInput = Pick<Annotation, 'slide' | 'element' | 'comment'> & {
  screenshot?: string | null;
};

export interface AnnotationSession {
  schema: 'deckmark/annotation-session/v1';
  session_id: string;
  created_at: string;
  closed: boolean;
  closed_at: string | null;
  deck_dir: string;
  engine: string;
  build_hash: string;
  previous_session_id: string | null;
  summary: string | null;
  annotations: Annotation[];
}
