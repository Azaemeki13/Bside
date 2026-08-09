export const TAGS = [
  'All',
  'Hip-Hop',
  'Jazz',
  'Indie',
  'Electronic',
  'Pop',
  'Classical',
  'Metal',
  'R&B',
  'Country',
  'Reggae',
  'Blues',
  'Folk',
  'Punk',
  'Soul',
  'Funk',
  'Disco',
  'Gospel',
  'Latin',
  'World',
] as const;

export const ML_MOODS = [
  'All', 'Happy', 'Sad', 'Relaxed', 'Aggressive', 'Electronic', 'Party'
] as const;

export type MlMood = typeof ML_MOODS[number];
