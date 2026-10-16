export type ShellHistoryScreen = { kind: string };

export type ShellHistoryPush<T extends ShellHistoryScreen> = {
  mode: "replace";
  state: { offlineScreen: T; scrollY: number };
} | {
  mode: "push";
  replaceCurrent: Record<string, unknown> & { offlineScreen: T; scrollY: number };
  pushed: { offlineScreen: T; scrollY: number };
};

// History must record the screen that is actually visible. A click listener
// can close over an older screen, such as the guide tab visited before Market.
export function describeShellHistoryPush<T extends ShellHistoryScreen>(input: {
  replace: boolean;
  current: unknown;
  liveScreen: T;
  next: T;
  scrollY: number;
}): ShellHistoryPush<T> {
  if (input.replace) {
    return { mode: "replace", state: { offlineScreen: input.next, scrollY: 0 } };
  }
  const current = input.current && typeof input.current === "object"
    ? input.current as Record<string, unknown>
    : {};
  return {
    mode: "push",
    replaceCurrent: {
      ...current,
      offlineScreen: input.liveScreen,
      scrollY: input.scrollY,
    },
    pushed: { offlineScreen: input.next, scrollY: 0 },
  };
}

export function marketDetailBackPopsToList(sourceKind: string | null) {
  return sourceKind === "market";
}

export const COMPLETED_LOGIN_FLOW_KINDS = new Set([
  "welcome",
  "cloud-login",
  "register",
  "check-email",
]);

export const COMPLETED_PROJECT_FLOW_KINDS = new Set([
  "project-destination",
  "new-project",
]);

// Drop only the trailing screens of a finished login or new-project flow.
// Earlier pages stay. The move never steps before the first history entry.
export function planCompletedShellFlow<T extends ShellHistoryScreen>(
  stack: readonly T[],
  destinationKind: string,
  flowKinds: ReadonlySet<string>,
) {
  let end = stack.length;
  while (end > 0 && flowKinds.has(stack[end - 1].kind)) end -= 1;
  const kept = stack.slice(0, end);
  if (kept.length === 0) {
    return {
      go: stack.length > 1 ? 1 - stack.length : 0,
      replace: true,
      landedCount: Math.min(1, stack.length) || 1,
    };
  }
  const replaceLanded = kept[kept.length - 1].kind === destinationKind;
  const back = stack.length - kept.length;
  return {
    go: back === 0 ? 0 : -back,
    replace: replaceLanded,
    landedCount: kept.length,
  };
}

export function applyCompletedShellFlow<T extends ShellHistoryScreen>(
  stack: readonly T[],
  destination: T,
  flowKinds: ReadonlySet<string>,
) {
  const plan = planCompletedShellFlow(stack, destination.kind, flowKinds);
  const landed = stack.slice(0, plan.landedCount);
  const next = plan.replace
    ? [...landed.slice(0, -1), destination]
    : [...landed, destination];
  return { plan, next };
}
