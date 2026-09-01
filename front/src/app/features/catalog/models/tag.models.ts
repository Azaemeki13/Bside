/** Tags shared by catalog filters and upload forms. */
export const TAGS = [
  'All', 'Hip-Hop', 'Jazz', 'Indie', 'Electronic', 'Pop', 'Classical',
  'Metal', 'R&B', 'Country', 'Reggae', 'Blues', 'Folk', 'Punk', 'Soul',
  'Funk', 'Disco', 'Gospel', 'Latin', 'World',
] as const;

/** Moods accepted by the recommendation endpoint. */
export const ML_MOODS = [
  'All', 'Happy', 'Sad', 'Relaxed', 'Aggressive', 'Electronic', 'Party',
] as const;

/** A mood value that the recommendation model understands. */
export type MlMood = (typeof ML_MOODS)[number];
