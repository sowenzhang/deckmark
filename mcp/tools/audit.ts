import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildHash, contentHash } from '../../runtime/store/build-hash.ts';
import { analyzeDeckContent, inspectBuildDesign } from '../../runtime/quality/analyze.ts';
import { readDeckBrief, qualityMode, qualityTarget } from '../../runtime/quality/brief.ts';
import {
  CRITIC_RESPONSE_SCHEMA,
  RUBRIC,
  BEAUTY_DEFINITION,
  criticPrompt,
  scoreCritique,
  validateCriticSubmission
} from '../../runtime/quality/rubric.ts';
import { readLatestQualityReport, writeQualityReport } from '../../runtime/quality/store.ts';
import type { QualityFinding, QualityReport, ScreenshotArtifact } from '../../runtime/quality/types.ts';

interface AuditInput {
  dir?: string;
  content?: string;
  artifacts?: ScreenshotArtifact[];
  critique?: unknown;
  iteration?: number;
  run_id?: string;
  prepared_build_hash?: string;
}

function isUnder(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

function hasImageSignature(data: Buffer, extension: string): boolean {
  if (extension === '.png') {
    return data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (extension === '.webp') {
    return data.length >= 12 &&
      data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

async function normalizeArtifacts(
  deckDir: string,
  buildIndexPath: string,
  input: ScreenshotArtifact[] | undefined
): Promise<ScreenshotArtifact[]> {
  if (!input || input.length === 0) return [];
  const artifactDir = resolve(deckDir, '.deckmark', 'artifacts');
  const lexicalRoot = artifactDir;
  let root: string;
  try {
    root = await realpath(artifactDir);
  } catch {
    throw new Error('artifact directory does not exist; save screenshots under .deckmark/artifacts/');
  }
  const buildStat = await stat(buildIndexPath);
  const artifacts: ScreenshotArtifact[] = [];
  for (const artifact of input) {
    if (!artifact || typeof artifact.path !== 'string' || !artifact.path.trim()) {
      throw new Error('each artifact requires a path');
    }
    const path = resolve(deckDir, artifact.path);
    if (!isUnder(lexicalRoot, path)) {
      throw new Error(`artifact path must stay inside .deckmark/artifacts/: ${artifact.path}`);
    }
    const unresolved = await lstat(path);
    if (!unresolved.isFile() || unresolved.isSymbolicLink()) {
      throw new Error(`artifact must be a regular file: ${artifact.path}`);
    }
    const canonical = await realpath(path);
    if (!isUnder(root, canonical)) {
      throw new Error(`artifact path must stay inside .deckmark/artifacts/: ${artifact.path}`);
    }
    const extension = extname(path).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      throw new Error(`artifact must be a PNG, JPEG, or WebP image: ${artifact.path}`);
    }
    if (unresolved.size < 100) {
      throw new Error(`artifact is too small to be a screenshot: ${artifact.path}`);
    }
    if (unresolved.mtimeMs < buildStat.mtimeMs) {
      throw new Error(`artifact predates the current build; capture it again: ${artifact.path}`);
    }
    const signature = (await readFile(canonical)).subarray(0, 12);
    if (!hasImageSignature(signature, extension)) {
      throw new Error(`artifact does not contain a valid image signature: ${artifact.path}`);
    }
    artifacts.push({
      ...artifact,
      path: `.deckmark/artifacts/${relative(root, canonical).replace(/\\/g, '/')}`
    });
  }
  return artifacts;
}

function screenshotPlan(slideCount: number, hasFragments: boolean, hasAutoAnimate: boolean): object {
  return {
    required_for_blocking_mode: true,
    instructions: [
      'Capture every slide after fonts and images settle at a presentation viewport such as 1440x900.',
      'Prefer one representative overview or contact sheet plus full-size captures for visually important or questionable slides.',
      'Capture paired before/after states only where fragments or auto-animate carry meaning.',
      'Save screenshots under .deckmark/artifacts/ and pass those paths back through artifacts; advisory mode may proceed without screenshots with reduced confidence.'
    ],
    expected_static_slides: slideCount,
    fragment_state_pairs: hasFragments ? 'capture the most important staged reveal' : 'not required',
    auto_animate_state_pairs: hasAutoAnimate ? 'capture each intentional transformation sequence' : 'not required'
  };
}

function renderedEvidenceFindings(
  slideCount: number,
  design: { motion: string[] },
  artifacts: ScreenshotArtifact[]
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const staticSlides = new Set(
    artifacts
      .filter(artifact => artifact.state === undefined || artifact.state === 'static')
      .map(artifact => artifact.slide_index)
      .filter((index): index is number => index !== undefined)
  );
  const missingSlides = Array.from({ length: slideCount }, (_, index) => index)
    .filter(index => !staticSlides.has(index));
  if (missingSlides.length > 0) {
    findings.push({
      priority: 'P1',
      category: 'visual',
      message: `Blocking quality mode is missing rendered evidence for slides ${missingSlides.map(index => index + 1).join(', ')}.`,
      suggested_fix: 'Capture one settled static screenshot per slide and identify each artifact with slide_index.'
    });
  }
  if (design.motion.includes('fragment-reveals')) {
    const before = new Set(
      artifacts.filter(artifact => artifact.state === 'fragment-before').map(artifact => artifact.slide_index)
    );
    const hasPair = artifacts.some(artifact =>
      artifact.state === 'fragment-after' &&
      artifact.slide_index !== undefined &&
      before.has(artifact.slide_index)
    );
    if (!hasPair) {
      findings.push({
        priority: 'P1',
        category: 'motion',
        message: 'Fragment reveals are enabled without a before/after evidence pair.',
        suggested_fix: 'Capture the most important staged reveal before and after advancing its fragment.'
      });
    }
  }
  if (design.motion.includes('auto-animate')) {
    const before = new Set(
      artifacts.filter(artifact => artifact.state === 'auto-animate-before').map(artifact => artifact.slide_index)
    );
    const hasPair = artifacts.some(artifact =>
      artifact.state === 'auto-animate-after' &&
      artifact.slide_index !== undefined &&
      before.has(artifact.slide_index)
    );
    if (!hasPair) {
      findings.push({
        priority: 'P1',
        category: 'motion',
        message: 'Auto-animate is enabled without a before/after evidence pair.',
        suggested_fix: 'Capture the most important auto-animate sequence before and after the transition.'
      });
    }
  }
  return findings;
}

export const auditDeckTool = {
  name: 'audit_deck',
  description:
    'Evaluate a built deck against its brief. First call without critique to get deterministic findings, the beauty/narrative/audience rubric, screenshot plan, critic prompt, and response schema. Have a different model review the deck when available, then call again with its structured critique to persist an accept/revise verdict tied to the current build hash. Blocking quality mode prevents publishing a stale or rejected deck.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Project directory (defaults to cwd)' },
      content: { type: 'string', description: 'Content file name (defaults to content.md)' },
      artifacts: {
        type: 'array',
        description: 'Optional repository-local screenshots. Required for a high-confidence blocking verdict.',
        items: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string' },
            slide_index: { type: 'number' },
            state: {
              type: 'string',
              enum: ['static', 'fragment-before', 'fragment-after', 'auto-animate-before', 'auto-animate-after']
            },
            viewport: { type: 'string' },
            note: { type: 'string' }
          }
        }
      },
      critique: {
        type: 'object',
        description: 'Structured independent-critic response matching the schema returned by the preparation call.'
      },
      run_id: {
        type: 'string',
        description: 'Quality-run identifier returned by the preparation call. Reuse it for critique submission and later iterations.'
      },
      prepared_build_hash: {
        type: 'string',
        description: 'Build hash returned by the preparation call. Required with critique so the verdict cannot certify a different build.'
      },
      iteration: {
        type: 'integer',
        minimum: 1,
        maximum: 3,
        default: 1,
        description: 'Bounded quality-loop pass number. Stop after pass 3 if the deck is still below the bar.'
      }
    }
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as AuditInput;
    const deckDir = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
    const contentPath = resolve(deckDir, opts.content ?? 'content.md');
    const buildDir = resolve(deckDir, 'build');
    const buildIndexPath = resolve(buildDir, 'index.html');
    const deckRoot = await realpath(deckDir);
    const canonicalContentPath = await realpath(contentPath);
    if (!isUnder(deckRoot, canonicalContentPath)) {
      throw new Error('content file must stay inside the deck directory');
    }
    const [content, html, briefResult, hash, artifacts] = await Promise.all([
      readFile(canonicalContentPath, 'utf8'),
      readFile(buildIndexPath, 'utf8'),
      readDeckBrief(deckDir),
      buildHash(buildDir),
      normalizeArtifacts(deckDir, buildIndexPath, opts.artifacts)
    ]);

    const design = inspectBuildDesign(html);
    const sourceHash = contentHash(content);
    if (!design.contentHash || design.contentHash !== sourceHash) {
      throw new Error('content has changed since build_deck; rebuild before running audit_deck');
    }
    const contentFile = relative(deckRoot, canonicalContentPath).replace(/\\/g, '/');
    const runId = typeof opts.run_id === 'string' && opts.run_id.trim()
      ? opts.run_id.trim()
      : randomUUID();
    const slideCount = content.split(/^\s*---\s*$/m).map(block => block.trim()).filter(Boolean).length;
    const findings = analyzeDeckContent(content, briefResult.brief, briefResult.missing, design);
    const mode = qualityMode(briefResult.brief);
    const target = qualityTarget(briefResult.brief);
    if (mode === 'blocking' && artifacts.length === 0) {
      findings.push({
        priority: 'P1',
        category: 'visual',
        message: 'Blocking quality mode requires rendered screenshot evidence.',
        suggested_fix: 'Capture the rendered slides and call audit_deck again with repository-local artifact paths.'
      });
    } else if (mode === 'blocking') {
      findings.push(...renderedEvidenceFindings(slideCount, design, artifacts));
    }

    const prompt = criticPrompt({
      brief: briefResult.brief,
      content,
      deterministicFindings: findings,
      artifacts,
      target
    });
    const plan = screenshotPlan(
      slideCount,
      design.motion.includes('fragment-reveals'),
      design.motion.includes('auto-animate')
    );

    if (opts.critique === undefined) {
      return {
        status: 'needs_critic',
        run_id: runId,
        build_hash: hash,
        content_file: contentFile,
        content_hash: sourceHash,
        brief_hash: briefResult.briefHash,
        mode,
        target,
        design,
        brief: briefResult.brief,
        brief_complete: briefResult.missing.length === 0,
        definition_of_beautiful: BEAUTY_DEFINITION,
        rubric: RUBRIC,
        deterministic_findings: findings,
        screenshot_plan: plan,
        critic_prompt: prompt,
        critic_response_schema: CRITIC_RESPONSE_SCHEMA
      };
    }

    if (!opts.run_id || !opts.run_id.trim()) {
      throw new Error('critique submission requires the run_id returned by the preparation call');
    }
    if (!opts.prepared_build_hash) {
      throw new Error('critique submission requires prepared_build_hash from the preparation call');
    }
    if (opts.prepared_build_hash !== hash) {
      throw new Error('the deck changed after the critic packet was prepared; run audit_deck preparation again');
    }
    const critique = validateCriticSubmission(opts.critique);
    if (
      mode === 'blocking' &&
      (!critique.reviewer.independent || critique.reviewer.method !== 'different-model')
    ) {
      findings.push({
        priority: 'P1',
        category: 'audience',
        message: 'Blocking quality mode requires a genuinely independent different-model review.',
        suggested_fix: 'Dispatch the critic packet to a different model and submit that reviewer metadata honestly.'
      });
    }
    const scoring = scoreCritique(critique, findings, target);
    const iteration = Math.min(3, Math.max(1, Math.trunc(opts.iteration ?? 1)));
    const previous = iteration > 1 ? await readLatestQualityReport(deckDir) : null;
    if (
      iteration > 1 &&
      (!previous || previous.run_id !== runId || previous.iteration !== iteration - 1)
    ) {
      throw new Error(`iteration ${iteration} requires iteration ${iteration - 1} from the same quality run`);
    }
    const scoreDelta = previous
      ? Number((scoring.overall - previous.overall_score).toFixed(2))
      : null;
    const previousBlocking = previous
      ? [...previous.deterministic_findings, ...previous.critic_findings]
          .filter(finding => finding.priority === 'P1').length
      : null;
    const currentBlocking = [...findings, ...critique.findings]
      .filter(finding => finding.priority === 'P1').length;
    const clearedFloor = previous
      ? previous.floor_failures.some(floor => !scoring.floorFailures.includes(floor))
      : false;
    const resolvedBlocker = previousBlocking !== null && currentBlocking < previousBlocking;
    const stopReason =
      scoring.verdict === 'accept' ? 'accepted' :
      scoreDelta !== null && scoreDelta <= -0.25 ? 'regression' :
      scoreDelta !== null && Math.abs(scoreDelta) < 0.05 && !clearedFloor && !resolvedBlocker ? 'plateau' :
      iteration >= 3 ? 'cap' :
      null;
    const report: QualityReport = {
      schema: 'deckmark/quality-report/v1',
      created_at: new Date().toISOString(),
      run_id: runId,
      build_hash: hash,
      content_file: contentFile,
      content_hash: sourceHash,
      brief_hash: briefResult.briefHash,
      mode,
      target,
      iteration,
      verdict: scoring.verdict,
      overall_score: Number(scoring.overall.toFixed(2)),
      beauty_score: Number(scoring.beauty.toFixed(2)),
      audience_score: Number(scoring.audience.toFixed(2)),
      floor_failures: scoring.floorFailures,
      deterministic_findings: findings,
      critic_findings: critique.findings,
      audience_reception: critique.audience_reception,
      artifacts,
      reviewer: critique.reviewer,
      score_delta: scoreDelta,
      stop: { stop: stopReason !== null, reason: stopReason },
      summary: critique.summary
    };
    const reportPath = await writeQualityReport(deckDir, report);
    const blocking = [
      ...findings.filter(finding => finding.priority === 'P1'),
      ...critique.findings.filter(finding => finding.priority === 'P1')
    ] as QualityFinding[];
    return {
      status: scoring.verdict,
      report_path: reportPath,
      ...report,
      blocking_findings: blocking
    };
  }
};
