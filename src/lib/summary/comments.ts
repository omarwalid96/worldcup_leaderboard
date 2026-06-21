// Shared (client-safe) types/constants for summary comments. The server action
// lives in comments-actions.ts; the client card imports these from here.
export const MAX_COMMENT_CHARS = 140;

export interface SummaryComment {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
}
