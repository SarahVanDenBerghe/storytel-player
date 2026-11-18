export interface Chapter {
  number: number;
  /** Shown instead of number: the book's own chapter number ("25"), or "" for none. */
  label?: string;
  title: string;
  durationInSeconds: number;
  start: number;
  end: number;
}