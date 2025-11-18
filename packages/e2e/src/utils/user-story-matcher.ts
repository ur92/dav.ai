import type { UserStoriesResult, UserStory } from './api-client.js';

export interface UserStoryMatchResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLength;
}

/**
 * Find matching story in actual stories by title or flow similarity
 */
function findMatchingStory(
  expectedStory: UserStory,
  actualStories: UserStory[],
  usedIndices: Set<number>
): { story: UserStory; index: number; similarity: number } | null {
  let bestMatch: { story: UserStory; index: number; similarity: number } | null = null;
  let bestSimilarity = 0;

  for (let i = 0; i < actualStories.length; i++) {
    if (usedIndices.has(i)) continue;

    const actualStory = actualStories[i];

    // Check title similarity
    const titleSimilarity = stringSimilarity(expectedStory.title, actualStory.title);

    // Check flow similarity (compare URL transitions)
    const expectedFlows = expectedStory.flow.map(
      (f) => `${f.from}->${f.to}`
    );
    const actualFlows = actualStory.flow.map((f) => `${f.from}->${f.to}`);
    const flowOverlap = expectedFlows.filter((f) => actualFlows.includes(f)).length;
    const flowSimilarity =
      expectedFlows.length > 0
        ? flowOverlap / Math.max(expectedFlows.length, actualFlows.length)
        : 0;

    // Combined similarity (weight title more)
    const combinedSimilarity = titleSimilarity * 0.6 + flowSimilarity * 0.4;

    if (combinedSimilarity > bestSimilarity && combinedSimilarity > 0.5) {
      bestSimilarity = combinedSimilarity;
      bestMatch = { story: actualStory, index: i, similarity: combinedSimilarity };
    }
  }

  return bestMatch;
}

/**
 * Match actual user stories against expected user stories
 */
export function matchUserStories(
  actual: UserStoriesResult,
  expected: UserStoriesResult
): UserStoryMatchResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check story count (allow ±1 variance)
  const storyCountDiff = Math.abs(actual.stories.length - expected.stories.length);
  if (storyCountDiff > 1) {
    errors.push(
      `Story count mismatch: expected ${expected.stories.length}, got ${actual.stories.length}`
    );
  } else if (storyCountDiff === 1) {
    warnings.push(
      `Story count differs by 1: expected ${expected.stories.length}, got ${actual.stories.length}`
    );
  }

  // Match each expected story to an actual story
  const usedIndices = new Set<number>();
  const unmatchedExpected: string[] = [];
  const matchedStories: Array<{
    expected: UserStory;
    actual: UserStory;
    similarity: number;
  }> = [];

  for (const expectedStory of expected.stories) {
    const match = findMatchingStory(expectedStory, actual.stories, usedIndices);

    if (!match) {
      unmatchedExpected.push(expectedStory.title);
    } else {
      usedIndices.add(match.index);
      matchedStories.push({
        expected: expectedStory,
        actual: match.story,
        similarity: match.similarity,
      });

      // Check flow matches
      const expectedFlows = expectedStory.flow.map((f) => `${f.from}->${f.to}`);
      const actualFlows = match.story.flow.map((f) => `${f.from}->${f.to}`);

      for (const expectedFlow of expectedFlows) {
        if (!actualFlows.includes(expectedFlow)) {
          warnings.push(
            `Story "${expectedStory.title}": missing expected flow ${expectedFlow}`
          );
        }
      }

      // Check that key steps are present (fuzzy match)
      const expectedStepKeywords = expectedStory.steps
        .flatMap((step) => step.toLowerCase().split(/\s+/))
        .filter((word) => word.length > 3); // Filter out short words

      const actualStepText = match.story.steps.join(' ').toLowerCase();
      const missingKeywords = expectedStepKeywords.filter(
        (keyword) => !actualStepText.includes(keyword)
      );

      if (missingKeywords.length > expectedStepKeywords.length * 0.3) {
        warnings.push(
          `Story "${expectedStory.title}": many expected step keywords missing`
        );
      }
    }
  }

  if (unmatchedExpected.length > 0) {
    errors.push(
      `Could not find matching stories for: ${unmatchedExpected.join(', ')}`
    );
  }

  // Check summary similarity
  if (expected.summary && actual.summary) {
    const summarySimilarity = stringSimilarity(expected.summary, actual.summary);
    if (summarySimilarity < 0.6) {
      warnings.push('Summary text differs significantly from expected');
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

