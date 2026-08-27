import type { PaperCorners, PaperCraneGeometryObservation, Point2D } from './types.js';

function centroid(corners: PaperCorners): Point2D {
  return {
    x: corners.reduce((sum, point) => sum + point.x, 0) / 4,
    y: corners.reduce((sum, point) => sum + point.y, 0) / 4,
  };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface NormalizedPaperGeometry {
  corners: PaperCorners;
  width: number;
  height: number;
  area: number;
  homographyInput: PaperCorners;
}

export function normalizePaperGeometry(corners: PaperCorners): NormalizedPaperGeometry {
  const center = centroid(corners);
  const ordered = [...corners].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
  );
  const minX = Math.min(...ordered.map((point) => point.x));
  const maxX = Math.max(...ordered.map((point) => point.x));
  const minY = Math.min(...ordered.map((point) => point.y));
  const maxY = Math.max(...ordered.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) throw new Error('Paper corners must enclose a positive area.');

  const normalized = ordered.map((point) => ({
    x: (point.x - minX) / width,
    y: (point.y - minY) / height,
  })) as unknown as PaperCorners;
  return {
    corners: normalized,
    width,
    height,
    area: width * height,
    homographyInput: corners,
  };
}

export function edgeAlignmentScore(corners: PaperCorners): number {
  const [a, b, c, d] = normalizePaperGeometry(corners).corners;
  const oppositeWidth = Math.abs(distance(a, b) - distance(c, d));
  const oppositeHeight = Math.abs(distance(b, c) - distance(d, a));
  return Math.max(0, 1 - (oppositeWidth + oppositeHeight) / 2);
}

export function isVisiblePaperObservation(
  observation: PaperCraneGeometryObservation,
  minimumVisibility = 0.7,
): boolean {
  return !observation.handOccluded && observation.visibilityScore >= minimumVisibility;
}
