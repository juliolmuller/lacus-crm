'use server';

import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { markPending, moveToTop, reorderQueue, skipItem } from '@/lib/services/queue';

const run = async (fn: () => Promise<unknown>): Promise<Result> => {
  await requireOwner();

  try {
    await fn();

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
};

export async function reorderQueueAction(positions: number[]): Promise<Result> {
  return run(() => reorderQueue(getDb(), positions));
}
export async function moveToTopAction(position: number): Promise<Result> {
  return run(() => moveToTop(getDb(), position));
}
export async function skipQueueAction(position: number, skip: boolean): Promise<Result> {
  return run(() => skipItem(getDb(), position, skip));
}
export async function markPendingAction(position: number): Promise<Result> {
  return run(() => markPending(getDb(), position));
}
