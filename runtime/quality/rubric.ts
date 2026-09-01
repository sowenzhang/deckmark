import {
  QUALITY_DIMENSIONS,
  type CriticSubmission,
  type QualityDimension,
  type QualityFinding,
  type QualityPriority,
  type ScreenshotArtifact,
  type DeckBrief
} from './types.ts';

interface DimensionDefinition {
  key: QualityDimension;
  weight: number;
  floor: number;
  question: string;
}

export const BEAUTY_DEFINITION = [
  'Intentional: the deck commits to a visual direction that fits this audience and message.',
  'Hierarchical: every slide makes the reading order and primary point immediately obvious.',
  'Composed: scale, alignment, whitespace, density, and visual rhythm feel deliberate.',
  'Specific: the deck avoids interchangeable templates and uses visual choices particular to this story.',
  'Coherent: typography, color, imagery, and layout form one system while slides still vary enough to stay engaging.',
  'Meaningful: charts, diagrams, images, and motion clarify the argument rather than decorate it.',
  'Polished: details are resolved well enough that the audience focuses on the message, not the construction.'
] as const;

export const RUBRIC: DimensionDefinition[] = [
  { key: 'visual_intent', weight: 1, floor: 6.5, question: 'Does the deck express a deliberate visual point of view appropriate to the brief?' },
  { key: 'hierarchy', weight: 1, floor: 6.5, question: 'Can the audience identify the point and reading order of each slide immediately?' },
  { key: 'composition', weight: 1, floor: 6, question: 'Are scale, spacing, alignment, density, and slide-to-slide rhythm well composed?' },
  { key: 'distinctiveness', weight: 0.8, floor: 5.5, question: 'Does the deck feel particular to this message rather than like a generic template?' },
  { key: 'polish', weight: 0.8, floor: 6, question: 'Are typography, spacing, imagery, and details consistently resolved?' },
  { key: 'content_visual_fit', weight: 1, floor: 6.5, question: 'Do visual forms clarify the content and give important evidence an appropriate visual treatment?' },
  { key: 'motion_purpose', weight: 0.8, floor: 6, question: 'Is motion restrained and purposeful, including choosing no motion where that is more effective?' },
  { key: 'narrative_flow', weight: 1.2, floor: 7, question: 'Does each slide earn the next one through a coherent setup, development, evidence, and payoff?' },
  { key: 'audience_fit', weight: 1.3, floor: 7, question: 'Will the target audience understand, trust, and care about the message in its presentation context?' },
  { key: 'credibility', weight: 1, floor: 6.5, question: 'Are claims supported, objections anticipated, and uncertainty handled honestly?' },
  { key: 'memorability', weight: 0.9, floor: 6, question: 'Will the audience remember the intended takeaway and know what to do afterward?' }
];

function priority(value: unknown): QualityPriority {
  return value === 'P1' || value === 'P2' || value === 'P3' ? value : 'P2';
}

function category(value: unknown): CriticSubmission['findings'][number]['category'] {
  switch (value) {
    case 'brief':
    case 'structure':
    case 'density':
    case 'variety':
    case 'motion':
    case 'narrative':
    case 'audience':
    case 'visual':
      return value;
    default:
      return 'visual';
  }
}

function score(value: unknown, dimension: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`critic score for ${dimension} must be a number from 0 to 10`);
  }
  return value;
}

export function validateCriticSubmission(value: unknown): CriticSubmission {
  if (!value || typeof value !== 'object') {
    throw new Error('critique must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (!raw.scores || typeof raw.scores !== 'object') {
    throw new Error('critique.scores is required');
  }
  const rawScores = raw.scores as Record<string, unknown>;
  const scores = Object.fromEntries(
    QUALITY_DIMENSIONS.map(key => [key, score(rawScores[key], key)])
  ) as unknown as CriticSubmission['scores'];

  const findings = Array.isArray(raw.findings)
    ? raw.findings.map((item, index) => {
        if (!item || typeof item !== 'object') throw new Error(`critique.findings[${index}] must be an object`);
        const finding = item as Record<string, unknown>;
        if (typeof finding.message !== 'string' || typeof finding.suggested_fix !== 'string') {
          throw new Error(`critique.findings[${index}] requires message and suggested_fix`);
        }
        return {
          priority: priority(finding.priority),
          category: category(finding.category),
          message: finding.message,
          suggested_fix: finding.suggested_fix,
          slide_index: typeof finding.slide_index === 'number' ? finding.slide_index : undefined,
          prompted: typeof finding.prompted === 'boolean' ? finding.prompted : undefined,
          confidence: typeof finding.confidence === 'number' ? finding.confidence : undefined
        };
      })
    : [];

  const audienceReception = Array.isArray(raw.audience_reception)
    ? raw.audience_reception.map((item, index) => {
        if (!item || typeof item !== 'object') {
          throw new Error(`critique.audience_reception[${index}] must be an object`);
        }
        const reception = item as Record<string, unknown>;
        for (const field of ['persona', 'comprehension', 'likely_reaction', 'remembered_message', 'action_clarity']) {
          if (typeof reception[field] !== 'string') {
            throw new Error(`critique.audience_reception[${index}].${field} is required`);
          }
        }
        return {
          persona: reception.persona as string,
          comprehension: reception.comprehension as string,
          likely_reaction: reception.likely_reaction as string,
          remembered_message: reception.remembered_message as string,
          objection: typeof reception.objection === 'string' ? reception.objection : undefined,
          action_clarity: reception.action_clarity as string
        };
      })
    : [];
  if (audienceReception.length < 3) {
    throw new Error('critique.audience_reception requires at least three audience perspectives');
  }

  if (!raw.reviewer || typeof raw.reviewer !== 'object') {
    throw new Error('critique.reviewer is required');
  }
  const rawReviewer = raw.reviewer as Record<string, unknown>;
  const method = rawReviewer.method === 'different-model' ? 'different-model' : 'cold-self-review';
  const reviewer = {
    independent: rawReviewer.independent === true,
    method,
    model: typeof rawReviewer.model === 'string' ? rawReviewer.model : undefined
  } satisfies CriticSubmission['reviewer'];

  return {
    reviewer,
    scores,
    findings,
    audience_reception: audienceReception,
    summary: typeof raw.summary === 'string' ? raw.summary : ''
  };
}

function weightedAverage(critique: CriticSubmission, dimensions: QualityDimension[]): number {
  const defs = RUBRIC.filter(def => dimensions.includes(def.key));
  const weight = defs.reduce((sum, def) => sum + def.weight, 0);
  return defs.reduce((sum, def) => sum + critique.scores[def.key] * def.weight, 0) / weight;
}

export function scoreCritique(
  critique: CriticSubmission,
  deterministicFindings: QualityFinding[],
  target: number
): {
  verdict: 'accept' | 'revise';
  overall: number;
  beauty: number;
  audience: number;
  floorFailures: QualityDimension[];
} {
  const floorFailures = RUBRIC
    .filter(def => critique.scores[def.key] < def.floor)
    .map(def => def.key);
  const overall = weightedAverage(critique, [...QUALITY_DIMENSIONS]);
  const beauty = weightedAverage(critique, [
    'visual_intent', 'hierarchy', 'composition', 'distinctiveness', 'polish', 'content_visual_fit', 'motion_purpose'
  ]);
  const audience = weightedAverage(critique, [
    'narrative_flow', 'audience_fit', 'credibility', 'memorability'
  ]);
  const hasBlockingFinding =
    deterministicFindings.some(finding => finding.priority === 'P1') ||
    critique.findings.some(finding => finding.priority === 'P1');
  return {
    verdict: !hasBlockingFinding && floorFailures.length === 0 && overall >= target ? 'accept' : 'revise',
    overall,
    beauty,
    audience,
    floorFailures
  };
}

export function criticPrompt(opts: {
  brief: DeckBrief;
  content: string;
  deterministicFindings: QualityFinding[];
  artifacts: ScreenshotArtifact[];
  target: number;
}): string {
  const artifactLines = opts.artifacts.length
    ? opts.artifacts.map(artifact =>
        `- ${artifact.path}${artifact.slide_index === undefined ? '' : ` (slide ${artifact.slide_index + 1})`}` +
        `${artifact.state ? ` [${artifact.state}]` : ''}${artifact.viewport ? ` @ ${artifact.viewport}` : ''}`
      ).join('\n')
    : '- No screenshots were supplied. Judge visual dimensions conservatively and state the evidence limitation.';

  return `You are the independent deck critic. You did not create this presentation.

The brief is the authority, not your personal style preference. Review the deck as rendered when screenshots are available, then challenge its reasoning and audience reception.

Definition of beautiful:
${BEAUTY_DEFINITION.map(item => `- ${item}`).join('\n')}

Brief:
${JSON.stringify(opts.brief, null, 2)}

Deterministic findings to verify or disprove:
${opts.deterministicFindings.length ? JSON.stringify(opts.deterministicFindings, null, 2) : 'None.'}

Artifacts:
${artifactLines}
(Artifact paths are relative to the deck directory.)

Markdown source:
--- BEGIN DECK ---
${opts.content}
--- END DECK ---

Score every rubric dimension from 0 to 10. The target overall score is ${opts.target}. Be strict: 8 means clearly strong, not merely competent.

Evaluate reception through at least these perspectives:
1. A representative member of the stated target audience.
2. A skeptical audience member looking for unsupported claims or missing evidence.
3. A decision-maker asking what they should believe or do after the final slide.

For flow, classify what job each slide performs and identify leaps, repetition, missing setup, weak transitions, and unresolved promises. For motion, reward only animation that controls attention, explains change, stages complexity, or creates a deliberate emotional beat. Penalize decorative or repetitive motion.

Return only JSON matching the supplied response schema. Include reviewer metadata honestly: independent=true and method="different-model" only when you are a genuinely separate model from the builder. Tag findings P1 only when they threaten comprehension, credibility, the intended audience action, or the central visual/narrative experience. Mark prompted=true when a finding follows one of the supplied deterministic concerns; otherwise false.`;
}

export const CRITIC_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['reviewer', 'scores', 'findings', 'audience_reception', 'summary'],
  properties: {
    reviewer: {
      type: 'object',
      required: ['independent', 'method'],
      properties: {
        independent: { type: 'boolean' },
        method: { type: 'string', enum: ['different-model', 'cold-self-review'] },
        model: { type: 'string' }
      }
    },
    scores: {
      type: 'object',
      required: [...QUALITY_DIMENSIONS],
      properties: Object.fromEntries(QUALITY_DIMENSIONS.map(key => [key, { type: 'number', minimum: 0, maximum: 10 }]))
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['priority', 'category', 'message', 'suggested_fix', 'prompted'],
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          category: { type: 'string' },
          message: { type: 'string' },
          suggested_fix: { type: 'string' },
          slide_index: { type: 'number' },
          prompted: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 10 }
        }
      }
    },
    audience_reception: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        required: ['persona', 'comprehension', 'likely_reaction', 'remembered_message', 'action_clarity'],
        properties: {
          persona: { type: 'string' },
          comprehension: { type: 'string' },
          likely_reaction: { type: 'string' },
          remembered_message: { type: 'string' },
          objection: { type: 'string' },
          action_clarity: { type: 'string' }
        }
      }
    },
    summary: { type: 'string' }
  }
} as const;
