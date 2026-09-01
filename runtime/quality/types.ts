export type QualityMode = 'advisory' | 'blocking';
export type QualityPriority = 'P1' | 'P2' | 'P3';
export const QUALITY_FINDING_CATEGORIES = [
  'brief',
  'structure',
  'density',
  'variety',
  'motion',
  'narrative',
  'audience',
  'visual'
] as const;
export type QualityFindingCategory = typeof QUALITY_FINDING_CATEGORIES[number];

export interface DeckBrief {
  schema?: 'deckmark/brief/v1';
  audience?: {
    description?: string;
    familiarity?: string;
    needs?: string[];
    objections?: string[];
  };
  setting?: string;
  purpose?: string;
  key_takeaway?: string;
  desired_action?: string;
  tone?: string;
  visual_direction?: string;
  motion_intent?: string;
  narrative_arc?: string;
  quality?: {
    mode?: QualityMode;
    target?: number;
  };
}

export interface QualityFinding {
  priority: QualityPriority;
  category: QualityFindingCategory;
  message: string;
  suggested_fix: string;
  slide_index?: number;
}

export const QUALITY_DIMENSIONS = [
  'visual_intent',
  'hierarchy',
  'composition',
  'distinctiveness',
  'polish',
  'content_visual_fit',
  'motion_purpose',
  'narrative_flow',
  'audience_fit',
  'credibility',
  'memorability'
] as const;

export type QualityDimension = typeof QUALITY_DIMENSIONS[number];

export interface CriticFinding extends QualityFinding {
  prompted?: boolean;
  confidence?: number;
}

export interface AudienceReception {
  persona: string;
  comprehension: string;
  likely_reaction: string;
  remembered_message: string;
  objection?: string;
  action_clarity: string;
}

export interface CriticSubmission {
  reviewer: {
    independent: boolean;
    method: 'different-model' | 'cold-self-review';
    model?: string;
  };
  scores: Record<QualityDimension, number>;
  findings: CriticFinding[];
  audience_reception: AudienceReception[];
  summary: string;
}

export interface ScreenshotArtifact {
  path: string;
  sha256?: string;
  slide_index?: number;
  state?: 'static' | 'fragment-before' | 'fragment-after' | 'auto-animate-before' | 'auto-animate-after';
  viewport?: string;
  pixel_width?: number;
  pixel_height?: number;
  note?: string;
}

export interface QualityReport {
  schema: 'deckmark/quality-report/v1';
  created_at: string;
  run_id: string;
  build_hash: string;
  content_file: string;
  content_hash: string;
  brief_hash: string;
  packet_hash: string;
  mode: QualityMode;
  target: number;
  iteration: number;
  verdict: 'accept' | 'revise';
  overall_score: number;
  beauty_score: number;
  audience_score: number;
  floor_failures: QualityDimension[];
  deterministic_findings: QualityFinding[];
  critic_findings: CriticFinding[];
  audience_reception: AudienceReception[];
  artifacts: ScreenshotArtifact[];
  reviewer: CriticSubmission['reviewer'];
  score_delta: number | null;
  stop: {
    stop: boolean;
    reason: 'accepted' | 'cap' | 'plateau' | 'regression' | null;
  };
  summary: string;
}
