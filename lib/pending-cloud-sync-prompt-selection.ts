/**
 * Automatic pending-upload prompts must never reopen entries explicitly
 * deferred to manual upload. Manual entries remain in the user's queue.
 */
export function selectPendingCloudSyncPrompt<T extends { should_prompt: boolean }>(
  summaries: readonly T[],
): T | null {
  return summaries.find((item) => item.should_prompt) ?? null;
}
