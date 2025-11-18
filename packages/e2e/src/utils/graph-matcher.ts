import type { GraphData, GraphNode, GraphEdge } from './api-client.js';

export interface GraphMatchResult {
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
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLength;
}

/**
 * Find matching edge in actual graph
 */
function findMatchingEdge(
  expectedEdge: GraphEdge,
  actualEdges: GraphEdge[]
): GraphEdge | null {
  // First try exact match
  const exactMatch = actualEdges.find(
    (e) => e.source === expectedEdge.source && e.target === expectedEdge.target
  );
  if (exactMatch) return exactMatch;

  // Try fuzzy match on label/selector
  for (const edge of actualEdges) {
    if (edge.source === expectedEdge.source && edge.target === expectedEdge.target) {
      const labelSimilarity = stringSimilarity(
        expectedEdge.label.toLowerCase(),
        edge.label.toLowerCase()
      );
      if (labelSimilarity > 0.7) {
        return edge;
      }
    }
  }

  return null;
}

/**
 * Match actual graph against expected graph
 */
export function matchGraph(
  actual: GraphData,
  expected: GraphData
): GraphMatchResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check node count (allow some variance)
  const nodeCountDiff = Math.abs(actual.nodes.length - expected.nodes.length);
  if (nodeCountDiff > 2) {
    errors.push(
      `Node count mismatch: expected ${expected.nodes.length}, got ${actual.nodes.length}`
    );
  } else if (nodeCountDiff > 0) {
    warnings.push(
      `Node count differs: expected ${expected.nodes.length}, got ${actual.nodes.length}`
    );
  }

  // Check that all expected URLs are present
  const actualUrls = new Set(actual.nodes.map((n) => n.url));
  const missingUrls: string[] = [];

  for (const expectedNode of expected.nodes) {
    if (!actualUrls.has(expectedNode.url)) {
      missingUrls.push(expectedNode.url);
    }
  }

  if (missingUrls.length > 0) {
    errors.push(`Missing expected URLs: ${missingUrls.join(', ')}`);
  }

  // Check edges
  const actualEdgesByKey = new Map<string, GraphEdge>();
  for (const edge of actual.edges) {
    const key = `${edge.source}->${edge.target}`;
    actualEdgesByKey.set(key, edge);
  }

  const missingEdges: string[] = [];
  const edgeMismatches: string[] = [];

  for (const expectedEdge of expected.edges) {
    const matchingEdge = findMatchingEdge(expectedEdge, actual.edges);

    if (!matchingEdge) {
      missingEdges.push(
        `${expectedEdge.source} -> ${expectedEdge.target} (${expectedEdge.label})`
      );
    } else {
      // Check label similarity (fuzzy match)
      const labelSimilarity = stringSimilarity(
        expectedEdge.label.toLowerCase(),
        matchingEdge.label.toLowerCase()
      );
      if (labelSimilarity < 0.7) {
        edgeMismatches.push(
          `Edge label mismatch: expected "${expectedEdge.label}", got "${matchingEdge.label}"`
        );
      }

      // Check selector if present in expected
      if (expectedEdge.selector && matchingEdge.selector) {
        const selectorSimilarity = stringSimilarity(
          expectedEdge.selector.toLowerCase(),
          matchingEdge.selector.toLowerCase()
        );
        if (selectorSimilarity < 0.8) {
          warnings.push(
            `Edge selector differs: expected "${expectedEdge.selector}", got "${matchingEdge.selector}"`
          );
        }
      }
    }
  }

  if (missingEdges.length > 0) {
    errors.push(`Missing expected edges:\n  ${missingEdges.join('\n  ')}`);
  }

  if (edgeMismatches.length > 0) {
    warnings.push(`Edge label mismatches:\n  ${edgeMismatches.join('\n  ')}`);
  }

  // Check fingerprints (allow "temp" fingerprints)
  for (const expectedNode of expected.nodes) {
    const actualNode = actual.nodes.find((n) => n.url === expectedNode.url);
    if (actualNode && expectedNode.fingerprint && expectedNode.fingerprint !== 'temp') {
      if (actualNode.fingerprint === 'temp') {
        warnings.push(
          `Node ${expectedNode.url} has temporary fingerprint (expected: ${expectedNode.fingerprint})`
        );
      } else if (actualNode.fingerprint !== expectedNode.fingerprint) {
        warnings.push(
          `Node ${expectedNode.url} fingerprint mismatch: expected ${expectedNode.fingerprint}, got ${actualNode.fingerprint}`
        );
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

