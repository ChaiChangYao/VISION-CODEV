export type GoldenRunJourneyState =
  | 'workflow'
  | 'capture-ready'
  | 'capturing'
  | 'processing'
  | 'review'
  | 'published'
  | 'deployment-ready'
  | 'monitoring'
  | 'intervention'
  | 'recovering'
  | 'complete'
  | 'error';

export const goldenRunJourney: readonly GoldenRunJourneyState[] = [
  'workflow',
  'capture-ready',
  'capturing',
  'processing',
  'review',
  'published',
  'deployment-ready',
  'monitoring',
  'intervention',
  'recovering',
  'complete',
];

export function journeyLabel(state: GoldenRunJourneyState) {
  return state === 'capture-ready'
    ? 'Ready to capture'
    : state === 'deployment-ready'
      ? 'Ready to deploy'
      : state.charAt(0).toUpperCase() + state.slice(1);
}

export function isJourneyComplete(state: GoldenRunJourneyState) {
  return state === 'complete';
}
