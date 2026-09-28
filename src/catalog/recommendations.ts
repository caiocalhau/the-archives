import { normalizeThemes } from './themes.js';

export interface RecommendationWork {
  id: string;
  title: string;
  subjects: readonly string[];
  authorIds: readonly string[];
  seriesIds: readonly string[];
}

export interface Recommendation {
  id: string;
  title: string;
  score: number;
  sharedThemes: { id: string; label: string; weight: number }[];
  sharedAuthorIds: string[];
}

export function rankRecommendations(
  source: RecommendationWork,
  candidates: readonly RecommendationWork[],
  limit: number,
): Recommendation[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Recommendation limit must be a positive integer');
  }

  const sourceThemes = new Set(normalizeThemes(source.subjects).map(({ id }) => id));
  const sourceAuthors = new Set(source.authorIds);
  const sourceSeries = new Set(source.seriesIds);
  const recommendations: Recommendation[] = [];

  for (const candidate of candidates) {
    if (candidate.id === source.id || candidate.seriesIds.some((id) => sourceSeries.has(id))) {
      continue;
    }
    const sharedThemes = normalizeThemes(candidate.subjects).filter(({ id }) => sourceThemes.has(id));
    if (!sharedThemes.some(({ specificity }) => specificity === 'specific')) continue;

    const themeEvidence = sharedThemes.map(({ id, label, specificity }) => ({
      id, label, weight: specificity === 'specific' ? 3 : 1,
    }));
    const sharedAuthorIds = [...new Set(candidate.authorIds)]
      .filter((id) => sourceAuthors.has(id)).sort();
    const score = themeEvidence.reduce((total, { weight }) => total + weight, 0)
      + (sharedAuthorIds.length ? 1 : 0);

    recommendations.push({
      id: candidate.id, title: candidate.title, score,
      sharedThemes: themeEvidence, sharedAuthorIds,
    });
  }

  return recommendations.sort((left, right) => right.score - left.score
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)).slice(0, limit);
}
