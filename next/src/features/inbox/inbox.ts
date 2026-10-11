// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// The inbox's rows (pure): notifications as the user sees them (statuses
// through the overlay), pinned first, then newest first, optionally grouped
// by repository (groups ordered by their latest activity). Like the issue
// lists, the rows are fixed-height items: group headers and notifications.

import type {Notification} from '../../protocol/types.gen.ts';

export type InboxRow =
  | {type: 'group'; key: string; label: string; count: number}
  /** inHeader: its group's header names its repository (the row gives the number only). */
  | {type: 'note'; id: number; inHeader?: true};

export interface InboxView {
  /** Unread only (pinned notifications are not unread: they leave this view). */
  unread: boolean;
  /** Group by repository (else: pinned, then the rest). */
  byRepo: boolean;
}

export interface InboxContext {
  /** The status as the user sees it (pending read/unread/pin included). */
  status(n: Notification): string;
  repoName(repoId: number): string;
  /**
   * When its subject last had activity (the order, and the time shown). Forgejo moves a notification's
   * updated_at when its status changes too (read, pinned): triage must not move it to the top.
   */
  activity?: ((n: Notification) => string) | undefined;
}

/**
 * A notification's activity time: its updated_at, unless its issue was last updated earlier — then the
 * later updated_at is a status change (triage), and the issue's time is the activity.
 */
export function activityOf(n: Notification, issueUpdated: string | undefined): string {
  return issueUpdated !== undefined && issueUpdated < n.updated_at ? issueUpdated : n.updated_at;
}

export interface InboxResult {
  rows: InboxRow[];
  /** The notifications in display order. */
  ids: number[];
}

export function inboxRows(notes: Iterable<Notification>, view: InboxView, ctx: InboxContext): InboxResult {
  const at = ctx.activity ?? ((n: Notification) => n.updated_at);
  const newestFirst = (a: Notification, b: Notification) => {
    const x = at(a);
    const y = at(b);
    return x < y ? 1 : x > y ? -1 : b.id - a.id;
  };
  const pinned: Notification[] = [];
  const rest: Notification[] = [];
  for (const n of notes) {
    const st = ctx.status(n);
    if (view.unread && st !== 'unread') continue;
    (st === 'pinned' ? pinned : rest).push(n);
  }
  pinned.sort(newestFirst);
  rest.sort(newestFirst);
  const rows: InboxRow[] = [];
  const ids: number[] = [];
  const push = (key: string, label: string, list: readonly Notification[], inHeader = false) => {
    if (!list.length) return;
    rows.push({type: 'group', key, label, count: list.length});
    for (const n of list) {
      rows.push(inHeader ? {type: 'note', id: n.id, inHeader} : {type: 'note', id: n.id});
      ids.push(n.id);
    }
  };
  push('pinned', 'Pinned', pinned);
  if (!view.byRepo) {
    // A header only when it separates something (pinned above).
    if (pinned.length) push('rest', 'Latest', rest);
    else for (const n of rest) {
      rows.push({type: 'note', id: n.id});
      ids.push(n.id);
    }
    return {rows, ids};
  }
  // Repositories in the order of their newest notification (rest is sorted already).
  const groups = new Map<number, Notification[]>();
  for (const n of rest) {
    let g = groups.get(n.repo_id);
    if (!g) groups.set(n.repo_id, g = []);
    g.push(n);
  }
  // Pinned rows and the "Other" group (repositories not on this device) keep their repository's name on the row.
  for (const [repoId, list] of groups) {
    const name = ctx.repoName(repoId);
    push(`repo:${String(repoId)}`, name || 'Other', list, Boolean(name));
  }
  return {rows, ids};
}

/** The status a "pin" toggle sets: pinned ones are unpinned (read), others pinned. */
export function togglePin(status: string): 'read' | 'pinned' {
  return status === 'pinned' ? 'read' : 'pinned';
}
