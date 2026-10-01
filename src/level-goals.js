import { GOALS, GOAL_STORAGE_KEY } from './goals.js';
import { HIGH_SCORE_STORAGE_KEY } from './highscores.js';

const ROC_TARGETS = { 'high-score': 5000, 'pro-score': 15000, 'sick-score': 35000, combo: 5000 };
export const ROC_GOALS = Object.freeze(GOALS.map(goal => Object.freeze({
  ...goal,
  target: ROC_TARGETS[goal.id] ?? goal.target,
  description: goal.type === 'score' ? `Bank ${ROC_TARGETS[goal.id].toLocaleString('en-US')} points in one run.`
    : goal.type === 'combo' ? 'Land a single 5,000-point combo.'
    : goal.id === 'tape' ? 'Reach the secret tape on the quarter-pipe deck beneath the bridge.' : goal.description,
})));
export const PERINTON_GOALS = Object.freeze(ROC_GOALS.map(goal => Object.freeze({
  ...goal,
  description: goal.id==='tape' ? 'Reach the secret tape above the central curved transition deck.' : goal.description,
})));

// The original keys remain unchanged so an existing warehouse career is never
// migrated, replaced, or mistaken for progress at a different park.
export const LEVEL_GOAL_CONFIGS = Object.freeze({
  'genesee-warehouse': Object.freeze({ goals: GOALS, progressKey: GOAL_STORAGE_KEY, highScoresKey: HIGH_SCORE_STORAGE_KEY }),
  'roc-city-skatepark': Object.freeze({
    goals: ROC_GOALS,
    progressKey: 'j2s-pro-skater.roc-city-skatepark.goals.v1',
    highScoresKey: 'j2s-pro-skater.roc-city-skatepark.highscores.v1',
  }),
  'perinton-skatepark': Object.freeze({
    goals: PERINTON_GOALS,
    progressKey: 'j2s-pro-skater.perinton-skatepark.goals.v1',
    highScoresKey: 'j2s-pro-skater.perinton-skatepark.highscores.v1',
  }),
});
