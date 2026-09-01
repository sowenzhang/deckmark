import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { buildDeck } from '../../runtime/engines/reveal.ts';
import { analyzeDeckContent, inspectBuildDesign } from '../../runtime/quality/analyze.ts';
import {
  BEAUTY_DEFINITION,
  RUBRIC,
  scoreCritique,
  validateCriticSubmission
} from '../../runtime/quality/rubric.ts';
import { auditDeckTool } from '../../mcp/tools/audit.ts';
import { publishDeckTool } from '../../mcp/tools/publish.ts';
import { readDeckBrief } from '../../runtime/quality/brief.ts';
import type { CriticSubmission, DeckBrief } from '../../runtime/quality/types.ts';

function fakePng(fill = 0): Buffer {
  const png = new PNG({ width: 16, height: 16 });
  for (let index = 0; index < png.data.length; index += 1) {
    png.data[index] = (index + fill) % 256;
  }
  return PNG.sync.write(png);
}

const COMPLETE_BRIEF: DeckBrief = {
  schema: 'deckmark/brief/v1',
  audience: {
    description: 'Engineering leaders deciding whether to fund the migration',
    familiarity: 'Familiar with the product, not the implementation',
    needs: ['Business impact', 'Delivery confidence'],
    objections: ['Migration risk']
  },
  setting: 'Ten-minute leadership review',
  purpose: 'Secure approval for the migration',
  key_takeaway: 'The migration reduces operational risk without delaying roadmap delivery',
  desired_action: 'Approve the migration plan',
  tone: 'Confident and evidence-led',
  visual_direction: 'Editorial technical narrative with one strong chart',
  motion_intent: 'Use progressive reveals only when they stage the migration decision',
  narrative_arc: 'Risk today, evidence, migration plan, decision',
  quality: { mode: 'advisory', target: 8 }
};

const GOOD_CONTENT = `# Operational risk is now a roadmap constraint

The current system causes recurring incidents and slows feature delivery.

---

# Incidents consume the capacity needed for growth

| Measure | Current | After migration |
| --- | ---: | ---: |
| Recovery time | 4 hours | 30 minutes |
| Release rollback | Manual | Automated |

---

# The migration isolates risk in three controlled stages

- Prove compatibility with one service
- Move traffic behind a rollback switch
- Expand only after the reliability target holds

---

# Approve the migration plan

The staged approach reduces operational risk without delaying roadmap delivery.
`;

function highCritique(): CriticSubmission {
  return validateCriticSubmission({
    reviewer: {
      independent: true,
      method: 'different-model',
      model: 'test-critic'
    },
    scores: Object.fromEntries(RUBRIC.map(def => [def.key, 9])),
    findings: [],
    audience_reception: [
      {
        persona: 'Engineering leader',
        comprehension: 'The risk and staged mitigation are clear.',
        likely_reaction: 'Supportive if the capacity numbers are trusted.',
        remembered_message: 'The migration reduces risk without stopping roadmap work.',
        action_clarity: 'Approve the staged plan.'
      },
      {
        persona: 'Skeptical operator',
        comprehension: 'The operational failure mode and rollback path are visible.',
        likely_reaction: 'Will ask for the source of the recovery-time projection.',
        remembered_message: 'The rollout is reversible.',
        objection: 'Projection evidence needs a source.',
        action_clarity: 'Validate the pilot, then expand.'
      },
      {
        persona: 'Decision-maker',
        comprehension: 'The proposal connects reliability to roadmap capacity.',
        likely_reaction: 'Ready to decide.',
        remembered_message: 'A staged migration is lower risk than maintaining the current system.',
        action_clarity: 'Approve the migration plan.'
      }
    ],
    summary: 'Clear decision narrative with purposeful staged disclosure.'
  });
}

async function setupDeck(mode: 'advisory' | 'blocking' = 'advisory'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-quality-'));
  await writeFile(join(dir, 'content.md'), GOOD_CONTENT);
  await writeFile(
    join(dir, 'deckmark.brief.json'),
    JSON.stringify({ ...COMPLETE_BRIEF, quality: { mode, target: 8 } }, null, 2)
  );
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    style: 'technical',
    motion: ['slide-transitions', 'fragment-reveals'],
    motionStyle: 'engaging'
  });
  return dir;
}

test('beauty rubric defines every scored dimension with a floor and weight', () => {
  assert.ok(BEAUTY_DEFINITION.length >= 7);
  assert.equal(new Set(RUBRIC.map(def => def.key)).size, RUBRIC.length);
  for (const dimension of RUBRIC) {
    assert.ok(dimension.weight > 0);
    assert.ok(dimension.floor >= 5 && dimension.floor <= 10);
    assert.ok(dimension.question.length > 20);
  }
});

test('content analysis catches incomplete briefs, repetitive layouts, weak endings, and motion mismatch', () => {
  const content = `# Update

- One
- Two
- Three
- Four
- Five
- Six
- Seven

---

# Update

Paragraph.

---

# Update

Paragraph.

---

# Update

Paragraph.

---

# Thank you

Questions?
`;
  const findings = analyzeDeckContent(
    content,
    { desired_action: 'Approve the proposal', motion_intent: 'Static print deck' },
    ['audience.description', 'purpose'],
    { style: 'fashion', motion: ['slide-transitions'], motionStyle: 'subtle', contentHash: null }
  );
  assert.ok(findings.some(finding => finding.category === 'brief' && finding.priority === 'P1'));
  assert.ok(findings.some(finding => finding.category === 'variety'));
  assert.ok(findings.some(finding => finding.category === 'audience'));
  assert.ok(findings.some(finding => finding.category === 'motion' && finding.priority === 'P1'));
});

test('content analysis allows untitled visual pauses and does not misread nuanced motion intent', () => {
  const findings = analyzeDeckContent(
    `![A single memorable diagram](images/diagram.png)

---

# Explain the diagram

- First implication
- Second implication
`,
    {
      ...COMPLETE_BRIEF,
      motion_intent: 'None of the transitions should feel gimmicky, but a light fragment reveal is useful.'
    },
    [],
    { style: 'professional', motion: ['fragment-reveals'], motionStyle: 'subtle', contentHash: null }
  );
  assert.equal(findings.some(finding => finding.priority === 'P1'), false);
});

test('content analysis allows a concise untitled statement slide', () => {
  const findings = analyzeDeckContent(
    '**We lost $4.2M last quarter.**',
    COMPLETE_BRIEF,
    [],
    { style: 'fashion', motion: [], motionStyle: 'subtle', contentHash: null }
  );
  assert.equal(findings.some(finding => finding.priority === 'P1'), false);
});

test('content analysis accepts a complete, varied decision narrative without blockers', async () => {
  const dir = await setupDeck();
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  const design = inspectBuildDesign(html);
  const findings = analyzeDeckContent(GOOD_CONTENT, COMPLETE_BRIEF, [], design);
  assert.equal(findings.some(finding => finding.priority === 'P1'), false);
  assert.equal(design.style, 'technical');
  assert.deepEqual(design.motion, ['slide-transitions', 'fragment-reveals']);
  assert.equal(design.motionStyle, 'engaging');
  assert.match(design.contentHash ?? '', /^sha256:[a-f0-9]{64}$/);
  await rm(dir, { recursive: true });
});

test('critic scoring enforces audience and narrative floors even when the average is high', () => {
  const critique = highCritique();
  critique.scores.audience_fit = 5;
  const result = scoreCritique(critique, [], 8);
  assert.equal(result.verdict, 'revise');
  assert.ok(result.floorFailures.includes('audience_fit'));
});

test('critic validation requires honest reviewer metadata', () => {
  assert.throws(
    () => validateCriticSubmission({
      scores: Object.fromEntries(RUBRIC.map(def => [def.key, 9])),
      findings: [],
      audience_reception: [],
      summary: ''
    }),
    /audience_reception requires at least three|reviewer is required/i
  );
});

test('critic validation rejects malformed priorities and missing findings', () => {
  const valid = highCritique();
  assert.throws(
    () => validateCriticSubmission({
      ...valid,
      findings: [{
        priority: 'P1 ',
        category: 'narrative',
        message: 'Malformed blocker',
        suggested_fix: 'Fix it',
        prompted: false
      }]
    }),
    /priority must be P1, P2, or P3/i
  );
  const withoutFindings = { ...valid } as Record<string, unknown>;
  delete withoutFindings.findings;
  assert.throws(
    () => validateCriticSubmission(withoutFindings),
    /findings must be an array/i
  );
});

test('brief validation rejects invalid shapes and quality modes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-brief-validation-'));
  await writeFile(join(dir, 'deckmark.brief.json'), 'null');
  await assert.rejects(
    () => readDeckBrief(dir),
    /must contain a JSON object/i
  );
  await writeFile(
    join(dir, 'deckmark.brief.json'),
    JSON.stringify({ ...COMPLETE_BRIEF, quality: { mode: 'blockng', target: 8 } })
  );
  await assert.rejects(
    () => readDeckBrief(dir),
    /quality\.mode must be advisory or blocking/i
  );
  await rm(dir, { recursive: true });
});

test('audit_deck prepares a critic packet and persists an advisory verdict', async () => {
  const dir = await setupDeck();
  const prepared = await auditDeckTool.handler({ dir }) as Record<string, unknown>;
  assert.equal(prepared.status, 'needs_critic');
  assert.equal(prepared.brief_complete, true);
  assert.match(prepared.critic_prompt as string, /independent deck critic/i);
  assert.ok(Array.isArray(prepared.rubric));

  const completed = await auditDeckTool.handler({
    dir,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: highCritique()
  }) as Record<string, unknown>;
  assert.equal(completed.status, 'accept');
  assert.equal(completed.verdict, 'accept');
  assert.match(completed.report_path as string, /\.deckmark[\\/]quality[\\/]report-/);
  await rm(dir, { recursive: true });
});

test('blocking quality mode requires screenshot evidence and an accepted current report before publish', async () => {
  const dir = await setupDeck('blocking');
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file' }),
    /no quality report/i
  );

  const noEvidencePrepared = await auditDeckTool.handler({ dir }) as Record<string, unknown>;
  const noEvidence = await auditDeckTool.handler({
    dir,
    run_id: noEvidencePrepared.run_id,
    prepared_build_hash: noEvidencePrepared.build_hash,
    prepared_packet_hash: noEvidencePrepared.packet_hash,
    critique: highCritique()
  }) as Record<string, unknown>;
  assert.equal(noEvidence.status, 'revise');

  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  const artifacts = [];
  for (let index = 0; index < 4; index += 1) {
    const name = `.deckmark/artifacts/slide-${index + 1}.png`;
    await writeFile(join(dir, name), fakePng());
    artifacts.push({ path: name, state: 'static' as const, viewport: '1440x900', slide_index: index });
  }
  await writeFile(join(dir, '.deckmark', 'artifacts', 'fragment-before.png'), fakePng());
  await writeFile(join(dir, '.deckmark', 'artifacts', 'fragment-after.png'), fakePng());
  artifacts.push(
    { path: '.deckmark/artifacts/fragment-before.png', state: 'fragment-before' as const, viewport: '1440x900', slide_index: 2 },
    { path: '.deckmark/artifacts/fragment-after.png', state: 'fragment-after' as const, viewport: '1440x900', slide_index: 2 }
  );
  const acceptedPrepared = await auditDeckTool.handler({ dir, artifacts }) as Record<string, unknown>;
  const accepted = await auditDeckTool.handler({
    dir,
    artifacts,
    run_id: acceptedPrepared.run_id,
    prepared_build_hash: acceptedPrepared.build_hash,
    prepared_packet_hash: acceptedPrepared.packet_hash,
    critique: highCritique()
  }) as Record<string, unknown>;
  assert.equal(accepted.status, 'accept');
  assert.ok(
    (accepted.artifacts as Array<{ path: string }>).every(artifact =>
      artifact.path.startsWith('.deckmark/artifacts/')
    )
  );
  assert.doesNotMatch(JSON.stringify(accepted.artifacts), /[A-Z]:\\|\/Users\//);

  const published = await publishDeckTool.handler({
    dir,
    mode: 'single-file',
    out: 'quality-approved.html'
  }) as { out: string };
  assert.match(published.out, /quality-approved\.html$/);

  const revisedContent =
    GOOD_CONTENT.replace('Approve the migration plan', 'Approve the revised migration plan');
  await writeFile(
    join(dir, 'content.md'),
    revisedContent
  );
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file', out: 'unbuilt-source.html' }),
    /deck content changed after the accepted audit/i
  );
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    style: 'technical',
    motion: ['slide-transitions', 'fragment-reveals'],
    motionStyle: 'engaging'
  });
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file', out: 'stale.html' }),
    /report is stale/i
  );
  await rm(dir, { recursive: true });
});

test('blocking publish rejects a brief changed after the accepted audit', async () => {
  const dir = await setupDeck('blocking');
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  const artifacts = [];
  for (let index = 0; index < 4; index += 1) {
    const name = `.deckmark/artifacts/brief-slide-${index + 1}.png`;
    await writeFile(join(dir, name), fakePng());
    artifacts.push({ path: name, state: 'static' as const, viewport: '1440x900', slide_index: index });
  }
  await writeFile(join(dir, '.deckmark', 'artifacts', 'brief-fragment-before.png'), fakePng());
  await writeFile(join(dir, '.deckmark', 'artifacts', 'brief-fragment-after.png'), fakePng());
  artifacts.push(
    { path: '.deckmark/artifacts/brief-fragment-before.png', state: 'fragment-before' as const, slide_index: 2 },
    { path: '.deckmark/artifacts/brief-fragment-after.png', state: 'fragment-after' as const, slide_index: 2 }
  );
  const prepared = await auditDeckTool.handler({ dir, artifacts }) as Record<string, unknown>;
  await auditDeckTool.handler({
    dir,
    artifacts,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: highCritique()
  });
  await writeFile(
    join(dir, 'deckmark.brief.json'),
    JSON.stringify({
      ...COMPLETE_BRIEF,
      audience: { description: 'A different audience' },
      key_takeaway: 'A different takeaway',
      desired_action: 'Reject the migration',
      quality: { mode: 'blocking', target: 10 }
    })
  );
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file' }),
    /does not satisfy blocking-mode requirements/i
  );
  await rm(dir, { recursive: true });
});

test('audit rejects screenshot artifacts captured before the current build', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-old-artifact-'));
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  await writeFile(join(dir, '.deckmark', 'artifacts', 'old.png'), fakePng());
  await new Promise(resolve => setTimeout(resolve, 20));
  await writeFile(join(dir, 'content.md'), GOOD_CONTENT);
  await writeFile(join(dir, 'deckmark.brief.json'), JSON.stringify(COMPLETE_BRIEF));
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  await assert.rejects(
    () => auditDeckTool.handler({
      dir,
      artifacts: [{ path: '.deckmark/artifacts/old.png', state: 'static', slide_index: 0 }]
    }),
    /predates the current build/i
  );
  await rm(dir, { recursive: true });
});

test('audit rejects edited source that has not been rebuilt', async () => {
  const dir = await setupDeck();
  await writeFile(join(dir, 'content.md'), GOOD_CONTENT.replace('roadmap constraint', 'unbuilt source change'));
  await assert.rejects(
    () => auditDeckTool.handler({ dir }),
    /content has changed since build_deck/i
  );
  await rm(dir, { recursive: true });
});

test('audit rejects out-of-range artifact slide indices', async () => {
  const dir = await setupDeck();
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  await writeFile(join(dir, '.deckmark', 'artifacts', 'bad-index.png'), fakePng());
  await assert.rejects(
    () => auditDeckTool.handler({
      dir,
      artifacts: [{
        path: '.deckmark/artifacts/bad-index.png',
        state: 'static',
        slide_index: 99
      }]
    }),
    /slide_index must be an integer from 0 to 3/i
  );
  await rm(dir, { recursive: true });
});

test('critique packet is invalidated when screenshot bytes change after preparation', async () => {
  const dir = await setupDeck();
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  const path = join(dir, '.deckmark', 'artifacts', 'changing.png');
  await writeFile(path, fakePng(1));
  const artifacts = [{ path: '.deckmark/artifacts/changing.png', state: 'static' as const, slide_index: 0 }];
  const prepared = await auditDeckTool.handler({ dir, artifacts }) as Record<string, unknown>;
  await writeFile(path, fakePng(255));
  await assert.rejects(
    () => auditDeckTool.handler({
      dir,
      artifacts,
      run_id: prepared.run_id,
      prepared_build_hash: prepared.build_hash,
      prepared_packet_hash: prepared.packet_hash,
      critique: highCritique()
    }),
    /screenshot evidence changed after preparation/i
  );
  await rm(dir, { recursive: true });
});

test('quality loop stops on a plateau instead of iterating without a bound', async () => {
  const dir = await setupDeck();
  const low = highCritique();
  low.scores.narrative_flow = 6;
  const prepared = await auditDeckTool.handler({ dir }) as Record<string, unknown>;
  const first = await auditDeckTool.handler({
    dir,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: low,
    iteration: 1
  }) as { stop: { stop: boolean } };
  assert.equal(first.stop.stop, false);

  const second = await auditDeckTool.handler({
    dir,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: low,
    iteration: 2
  }) as { stop: { stop: boolean; reason: string } };
  assert.equal(second.stop.stop, true);
  assert.equal(second.stop.reason, 'plateau');
  await rm(dir, { recursive: true });
});

test('quality loop does not call a meaningful audience-score improvement a plateau', async () => {
  const dir = await setupDeck();
  const brief = { ...COMPLETE_BRIEF, quality: { mode: 'advisory' as const, target: 9 } };
  await writeFile(join(dir, 'deckmark.brief.json'), JSON.stringify(brief));
  const firstCritique = highCritique();
  firstCritique.scores.audience_fit = 7;
  const prepared = await auditDeckTool.handler({ dir }) as Record<string, unknown>;
  await auditDeckTool.handler({
    dir,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: firstCritique,
    iteration: 1
  });

  const improvedCritique = highCritique();
  improvedCritique.scores.audience_fit = 8;
  const second = await auditDeckTool.handler({
    dir,
    run_id: prepared.run_id,
    prepared_build_hash: prepared.build_hash,
    prepared_packet_hash: prepared.packet_hash,
    critique: improvedCritique,
    iteration: 2
  }) as { score_delta: number; stop: { stop: boolean; reason: string | null } };
  assert.ok(second.score_delta >= 0.1);
  assert.equal(second.stop.stop, false);
  assert.equal(second.stop.reason, null);
  await rm(dir, { recursive: true });
});

test('critique cannot certify a build different from the prepared critic packet', async () => {
  const dir = await setupDeck();
  const prepared = await auditDeckTool.handler({ dir }) as Record<string, unknown>;
  await writeFile(join(dir, 'content.md'), `${GOOD_CONTENT}\n\n<!-- changed after preparation -->\n`);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    style: 'technical',
    motion: ['slide-transitions', 'fragment-reveals'],
    motionStyle: 'engaging'
  });
  await assert.rejects(
    () => auditDeckTool.handler({
      dir,
      run_id: prepared.run_id,
      prepared_build_hash: prepared.build_hash,
      prepared_packet_hash: prepared.packet_hash,
      critique: highCritique()
    }),
    /changed after the critic packet was prepared/i
  );
  await rm(dir, { recursive: true });
});

test('pre-existing decks without a brief remain advisory and publish normally', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-legacy-'));
  await writeFile(join(dir, 'content.md'), '# Existing deck\n\nStill works.\n');
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  const result = await publishDeckTool.handler({
    dir,
    mode: 'single-file',
    out: 'legacy.html'
  }) as { out: string };
  assert.match(result.out, /legacy\.html$/);
  await rm(dir, { recursive: true });
});

test('legacy decks accept an explicit empty artifact list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-legacy-audit-'));
  await writeFile(join(dir, 'content.md'), '# Existing deck\n\nStill works.\n');
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  const prepared = await auditDeckTool.handler({ dir, artifacts: [] }) as { status: string };
  assert.equal(prepared.status, 'needs_critic');
  await rm(dir, { recursive: true });
});

test('artifact paths outside .deckmark/artifacts are rejected before inspection', async () => {
  const dir = await setupDeck();
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  const outside = join(dir, '..', `outside-${Date.now()}.png`);
  await writeFile(outside, fakePng());
  await assert.rejects(
    () => auditDeckTool.handler({
      dir,
      artifacts: [{ path: outside, state: 'static', slide_index: 0 }]
    }),
    /must stay inside \.deckmark\/artifacts/i
  );
  await rm(outside, { force: true });
  await rm(dir, { recursive: true });
});

test('blocking publish rejects malformed or incomplete quality report JSON', async () => {
  const dir = await setupDeck('blocking');
  await mkdir(join(dir, '.deckmark', 'quality'), { recursive: true });
  await writeFile(join(dir, '.deckmark', 'quality', 'latest.json'), '{');
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file' }),
    /quality report is not valid JSON/i
  );
  await writeFile(
    join(dir, '.deckmark', 'quality', 'latest.json'),
    JSON.stringify({ schema: 'deckmark/quality-report/v1', verdict: 'accept' })
  );
  await assert.rejects(
    () => publishDeckTool.handler({ dir, mode: 'single-file' }),
    /invalid schema/i
  );
  await rm(dir, { recursive: true });
});

test('quality calibration fixtures exercise both strong and weak deck shapes', async () => {
  const good = await readFile(resolve('test', 'fixtures', 'quality', 'decision-deck.md'), 'utf8');
  const repetitive = await readFile(resolve('test', 'fixtures', 'quality', 'repetitive-text-deck.md'), 'utf8');
  const design = {
    style: 'professional',
    motion: ['slide-transitions'],
    motionStyle: 'subtle',
    contentHash: null
  };
  const goodFindings = analyzeDeckContent(good, COMPLETE_BRIEF, [], design);
  const weakFindings = analyzeDeckContent(repetitive, COMPLETE_BRIEF, [], design);
  assert.equal(goodFindings.some(finding => finding.priority === 'P1'), false);
  assert.ok(weakFindings.some(finding => finding.category === 'variety'));
  assert.ok(weakFindings.some(finding => finding.category === 'audience'));
});
