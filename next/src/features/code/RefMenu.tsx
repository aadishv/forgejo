// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// The branch or tag picker of the code views and of the repository's
// overview (above its files, like GitHub's): its own module, so the overview
// does not pull in the source view to show it. Refs come from the pool.

import {useNavigate} from '@tanstack/react-router';
import {ChevronDown, GitBranch, GitCommitHorizontal, Tag} from 'lucide-react';
import {observer} from 'mobx-react-lite';
import {codeSplat, type RefKind, type Resolved, shortSha} from '../../code/refs.ts';
import {Button, CommandPopover, Icon, type PickOption} from '../../ui/index.ts';
import {usePool} from '../issues/cells.tsx';
import {refTable} from './hooks.ts';
import {codeTo} from './nav.tsx';

/**
 * The branch or tag on screen, and every other one to switch to (same path, same view): a picker that filters
 * as you type (Enter takes the first match), branches first.
 */
export const RefMenu = observer(function RefMenu({owner, repo, repoId, at, view}: {
  owner: string; repo: string; repoId: number; at: Pick<Resolved, 'kind' | 'ref' | 'sha' | 'path'>; view: 'src' | 'blame' | 'commits';
}) {
  const pool = usePool();
  const navigate = useNavigate();
  const refs = refTable(pool, repoId);
  const branches = [...refs.branches.keys()].sort((a, b) => (a === refs.defaultBranch ? -1 : b === refs.defaultBranch ? 1 : a.localeCompare(b)));
  const tags = [...refs.tags.keys()].sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
  const current = `${at.kind}:${at.ref}`;
  const option = (kind: RefKind, ref: string): PickOption => ({
    value: `${kind}:${ref}`, label: ref, group: kind === 'branch' ? 'Branches' : 'Tags', icon: kind === 'branch' ? GitBranch : Tag,
    meta: kind === 'branch' && ref === refs.defaultBranch ? 'default' : undefined, checked: current === `${kind}:${ref}`,
    onSelect: () => {
      void navigate(codeTo(owner, repo, codeSplat(view, {kind, ref}, at.path)));
    },
  });
  const label = at.kind === 'commit' ? shortSha(at.sha) : at.ref;
  return (
    <CommandPopover width="md" label="Switch branch or tag" placeholder="Find a branch or tag…" empty="No branch or tag is on this device."
      options={[...branches.map((b) => option('branch', b)), ...tags.map((t) => option('tag', t))]}
      trigger={
        <Button size="sm" icon={at.kind === 'tag' ? Tag : at.kind === 'commit' ? GitCommitHorizontal : GitBranch} aria-label={`Ref: ${label}`}>
          <span className="max-w-xs truncate font-mono">{label}</span><Icon icon={ChevronDown} size="sm"/>
        </Button>
      }/>
  );
});
