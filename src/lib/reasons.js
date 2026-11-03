// Short names for why a post was hidden, shown in the popup's list and the
// charts in settings.
import { CATEGORIES } from './questions.js';

const LABELS = {
  ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short || c.label])),
  country: 'Country',
  porn_bot: 'Porn bot',
  off_topic: 'Off-focus',
  muted: 'Muted word',
  promoted: 'Promoted',
  custom: 'Your rules',
};

export const reasonLabel = (id) => LABELS[id] || 'Other';
