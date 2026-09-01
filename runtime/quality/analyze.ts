import type { DeckBrief, QualityFinding } from './types.ts';

interface SlideAnalysis {
  index: number;
  title: string;
  body: string;
  words: number;
  bullets: string[];
  pattern: string;
}

export interface BuildDesign {
  style: string;
  motion: string[];
  motionStyle: string;
  contentHash: string | null;
}

const DENSITY_LIMITS: Record<string, number> = {
  professional: 85,
  academic: 120,
  fashion: 45,
  technical: 95,
  fun: 70
};

function words(value: string): string[] {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function significantWords(value: string): Set<string> {
  const stop = new Set([
    'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
    'but', 'can', 'could', 'for', 'from', 'have', 'into', 'its', 'not', 'our', 'that',
    'the', 'their', 'this', 'through', 'to', 'was', 'we', 'what', 'when', 'where', 'which',
    'will', 'with', 'you', 'your'
  ]);
  return new Set(words(value.toLowerCase()).filter(word => word.length > 3 && !stop.has(word)));
}

function overlapRatio(needle: string, haystack: string): number {
  const expected = significantWords(needle);
  if (expected.size === 0) return 1;
  const actual = significantWords(haystack);
  let overlap = 0;
  for (const word of expected) {
    if (actual.has(word)) overlap += 1;
  }
  return overlap / expected.size;
}

function slidePattern(block: string, bullets: string[]): string {
  if (/!\[[^\]]*]\([^)]+\)|<img\b/i.test(block)) return 'visual';
  if (/```|<pre\b/i.test(block)) return 'code';
  if (/^\s*\|.+\|\s*$/m.test(block)) return 'table';
  if (/^\s*>/m.test(block)) return 'quote';
  if (bullets.length > 0) return 'bullets';
  const body = block.replace(/^#+\s+.+$/m, '').trim();
  if (!body) return 'title';
  return 'prose';
}

function parseSlides(content: string): SlideAnalysis[] {
  return content
    .split(/^\s*---\s*$/m)
    .map(block => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const title = block.match(/^#+\s+(.+)$/m)?.[1]?.trim() ?? '';
      const body = block.replace(/^#+\s+.+$/m, '').trim();
      const bullets = [...block.matchAll(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/gm)].map(match => match[1].trim());
      return {
        index,
        title,
        body,
        words: words(block).length,
        bullets,
        pattern: slidePattern(block, bullets)
      };
    });
}

export function inspectBuildDesign(html: string): BuildDesign {
  const style = html.match(/data-deckmark-style="([^"]+)"/)?.[1] ?? 'professional';
  const motionStyle = html.match(/data-motion-style="([^"]+)"/)?.[1] ?? 'subtle';
  const motionValue = html.match(/data-deckmark-motion="([^"]*)"/)?.[1] ?? '';
  const motion = motionValue.split(',').map(value => value.trim()).filter(Boolean);
  const buildContentHash = html.match(/data-deckmark-content-hash="([^"]+)"/)?.[1] ?? null;
  return { style, motion, motionStyle, contentHash: buildContentHash };
}

export function analyzeDeckContent(
  content: string,
  brief: DeckBrief,
  missingBriefFields: string[],
  design: BuildDesign
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const slides = parseSlides(content);

  for (const field of missingBriefFields) {
    findings.push({
      priority: 'P1',
      category: 'brief',
      message: `The deck brief is missing ${field}.`,
      suggested_fix: `Fill ${field} in deckmark.brief.json before judging the deck.`
    });
  }

  const titleCounts = new Map<string, number>();
  const densityLimit = DENSITY_LIMITS[design.style] ?? DENSITY_LIMITS.professional;
  for (const slide of slides) {
    if (!slide.title) {
      const shortStatement =
        slide.bullets.length === 0 &&
        words(slide.body).length > 0 &&
        words(slide.body).length <= 15;
      if (!['visual', 'quote'].includes(slide.pattern) && !shortStatement) {
        findings.push({
          priority: 'P1',
          category: 'structure',
          slide_index: slide.index,
          message: `Slide ${slide.index + 1} has no title or concise statement.`,
          suggested_fix: 'Give the slide a message-led title or reduce it to one deliberate statement.'
        });
      }
    } else {
      const normalized = slide.title.toLowerCase();
      titleCounts.set(normalized, (titleCounts.get(normalized) ?? 0) + 1);
      if (words(slide.title).length > 14) {
        findings.push({
          priority: 'P2',
          category: 'density',
          slide_index: slide.index,
          message: `Slide ${slide.index + 1} has a title longer than 14 words.`,
          suggested_fix: 'Shorten the title into one clear assertion the audience can absorb immediately.'
        });
      }
    }
    if (slide.words > densityLimit) {
      findings.push({
        priority: 'P2',
        category: 'density',
        slide_index: slide.index,
        message: `Slide ${slide.index + 1} has ${slide.words} words; the ${design.style} style guideline is ${densityLimit}.`,
        suggested_fix: 'Split the idea, replace prose with a visual, or move supporting detail into speaker notes.'
      });
    }
    if (slide.bullets.length > 6) {
      findings.push({
        priority: 'P2',
        category: 'density',
        slide_index: slide.index,
        message: `Slide ${slide.index + 1} presents ${slide.bullets.length} bullets at once.`,
        suggested_fix: 'Group the list, reveal it in stages, or keep only the points needed for the spoken argument.'
      });
    }
    if (slide.bullets.some(bullet => words(bullet).length > 24)) {
      findings.push({
        priority: 'P3',
        category: 'density',
        slide_index: slide.index,
        message: `Slide ${slide.index + 1} contains a bullet longer than 24 words.`,
        suggested_fix: 'Turn the long bullet into a short claim with the explanation delivered verbally.'
      });
    }
  }

  for (const [title, count] of titleCounts) {
    if (count > 1) {
      findings.push({
        priority: 'P2',
        category: 'structure',
        message: `${count} slides use the same title "${title}".`,
        suggested_fix: 'Make each slide title express the distinct step it contributes to the argument.'
      });
    }
  }

  if (slides.length >= 5) {
    const patternCounts = new Map<string, number>();
    for (const slide of slides) {
      patternCounts.set(slide.pattern, (patternCounts.get(slide.pattern) ?? 0) + 1);
    }
    const dominant = [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] / slides.length >= 0.7) {
      findings.push({
        priority: 'P2',
        category: 'variety',
        message: `${dominant[1]} of ${slides.length} slides use the same ${dominant[0]} composition.`,
        suggested_fix: 'Vary the visual rhythm with a deliberate mix of statements, evidence, comparisons, diagrams, and pauses.'
      });
    }

    const visualSlides = slides.filter(slide => ['visual', 'code', 'table', 'quote'].includes(slide.pattern));
    if (visualSlides.length < Math.max(1, Math.floor(slides.length / 4))) {
      findings.push({
        priority: 'P2',
        category: 'visual',
        message: `Only ${visualSlides.length} of ${slides.length} slides use visual evidence or a non-text composition.`,
        suggested_fix: 'Convert key evidence into charts, diagrams, comparisons, or a single memorable visual moment.'
      });
    }
  }

  const allContent = slides.map(slide => `${slide.title} ${slide.body}`).join(' ');
  if (brief.key_takeaway && overlapRatio(brief.key_takeaway, allContent) < 0.25) {
    findings.push({
      priority: 'P2',
      category: 'narrative',
      message: 'The stated key takeaway is weakly represented in the slide content.',
      suggested_fix: 'Repeat the central idea through the opening promise, evidence sequence, and closing synthesis.'
    });
  }

  const lastSlide = slides.at(-1);
  if (lastSlide && brief.desired_action) {
    const closing = `${lastSlide.title} ${lastSlide.body}`;
    const genericClosing = /^(thank you|thanks|questions|q\s*&\s*a)\b/i.test(lastSlide.title);
    if (genericClosing || overlapRatio(brief.desired_action, closing) < 0.2) {
      findings.push({
        priority: 'P2',
        category: 'audience',
        slide_index: lastSlide.index,
        message: 'The closing slide does not clearly reinforce the desired audience action.',
        suggested_fix: 'End with the decision, behavior, or next step the audience should take after the presentation.'
      });
    }
  }

  const totalBullets = slides.reduce((sum, slide) => sum + slide.bullets.length, 0);
  if (design.motion.includes('fragment-reveals') && totalBullets < 2) {
    findings.push({
      priority: 'P2',
      category: 'motion',
      message: 'Fragment reveals are enabled, but the deck has almost no sequential list content.',
      suggested_fix: 'Disable fragment reveals or use them only where staged disclosure supports the spoken explanation.'
    });
  }

  if (design.motion.includes('auto-animate')) {
    const hasContinuity = slides.some((slide, index) => {
      const next = slides[index + 1];
      if (!next) return false;
      return overlapRatio(`${slide.title} ${slide.body}`, `${next.title} ${next.body}`) >= 0.3;
    });
    if (!hasContinuity) {
      findings.push({
        priority: 'P2',
        category: 'motion',
        message: 'Auto-animate is enabled without an obvious consecutive-slide visual build-up.',
        suggested_fix: 'Reserve auto-animate for before/after, progressive diagrams, or repeated objects whose transformation carries meaning.'
      });
    }
  }

  const motionIntent = brief.motion_intent?.toLowerCase() ?? '';
  const explicitlyStatic =
    /\bno\s+(motion|animation|animations|transitions)\b/.test(motionIntent) ||
    /\bstatic(?:\s+\w+){0,2}\s+(deck|presentation|slides?)\b/.test(motionIntent) ||
    /\bprint[- ]friendly\b/.test(motionIntent);
  if (explicitlyStatic && design.motion.length > 0) {
    findings.push({
      priority: 'P1',
      category: 'motion',
      message: 'The rendered motion conflicts with the brief, which asks for a static presentation.',
      suggested_fix: 'Build with motion: [] or update the brief if animation is now intentional.'
    });
  } else if (/engag|dynamic|cinematic|build|progress/.test(motionIntent) && design.motion.length === 0) {
    findings.push({
      priority: 'P2',
      category: 'motion',
      message: 'The brief asks for engaging or progressive motion, but the deck is static.',
      suggested_fix: 'Add a restrained transition, staged fragments, or a purposeful auto-animate sequence.'
    });
  }

  return findings;
}
