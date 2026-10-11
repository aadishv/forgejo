// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// A repository's home (/{owner}/{repo}): its name and kind, its latest
// commit, top-level files and README from the code cache (by commit and blob
// SHA: there offline once seen), and beside them the side pane
// (AboutSidebar.tsx: what it is, its releases and languages). The tabs lead
// to everything else. Its own chunk.

import {BookMarked, Folder, FolderGit2, GitBranch, SquarePen} from 'lucide-react';
import {observer} from 'mobx-react-lite';
import {type ReactNode, useEffect, useMemo} from 'react';
import {whenIdle} from '../../app/lazy.tsx';
import {openCreate} from '../../app/create.ts';
import {hrefOf, useLinkClick} from '../../app/links.ts';
import {codePath} from '../../app/paths.ts';
import {PageBody, PageColumn} from '../../app/shell/Frame.tsx';
import {shortcutHint} from '../../app/shortcuts/index.ts';
import {useApp} from '../../app/store.ts';
import {CodeSource} from '../../code/source.ts';
import type {APITree, APITreeEntry} from '../../protocol/types.gen.ts';
import {Badge, Button, EmptyState, Icon, ListRow, SkeletonText} from '../../ui/index.ts';
import {refTable, useLoad, useSource} from '../code/hooks.ts';
import {ReadmePanel, readmeOf} from '../code/Rendered.tsx';
import {Unloaded} from '../code/states.tsx';
import {entryParts, FilesPanel, RefCommit, treeOrder} from '../code/tree.tsx';
import {usePool} from '../issues/cells.tsx';
import {AboutSidebar} from './AboutSidebar.tsx';
import {RepoHeader, Unavailable, useRepoPage} from './repoPage.tsx';
import {EmptyRepo} from '../code/states.tsx';

export function RepoHome() {
  const {owner, repo, repoId} = useRepoPage();
  if (repoId === undefined) {
    return (
      <>
        <RepoHeader owner={owner} repo={repo} repoId={undefined} icon={BookMarked} title="Overview"/>
        <PageBody><Unavailable owner={owner} repo={repo}/></PageBody>
      </>
    );
  }
  return <RepoHomePage key={repoId} owner={owner} repo={repo} repoId={repoId}/>;
}

const RepoHomePage = observer(function RepoHomePage({owner, repo, repoId}: {owner: string; repo: string; repoId: number}) {
  const app = useApp();
  return (
    <>
      <RepoHeader owner={owner} repo={repo} repoId={repoId} icon={BookMarked} title="Overview">
        <Button size="sm" variant="ghost" icon={SquarePen} shortcut={shortcutHint('create')} tooltip="New issue in this repository" onClick={() => {
          openCreate(app, repoId);
        }}>New issue</Button>
      </RepoHeader>
      <PageBody>
        <div className="flex flex-col @xl:min-h-full @xl:flex-row">
          <PageColumn wide>
            <Summary repoId={repoId}/>
            <Files owner={owner} repo={repo} repoId={repoId}/>
          </PageColumn>
          <aside aria-label="About" className="shrink-0 border-t border-border p-4 @xl:w-pane @xl:border-t-0 @xl:border-l">
            <AboutSidebar owner={owner} repo={repo} repoId={repoId}/>
          </aside>
        </div>
      </PageBody>
    </>
  );
});

/** The repository's name and kind (its description and topics are in the side pane's About, like GitHub's). */
const Summary = observer(function Summary({repoId}: {repoId: number}) {
  const r = usePool().model('Repository').get(repoId)?.data;
  if (!r) return null;
  const flags = [r.private ? 'Private' : 'Public', r.fork && 'Fork', r.mirror && 'Mirror', r.template && 'Template', r.archived && 'Archived'].filter((f): f is string => Boolean(f));
  return (
    <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-fg">
      {r.name}
      {flags.map((f) => <Badge key={f} tone={f === 'Archived' ? 'warning' : 'neutral'} round>{f}</Badge>)}
    </h2>
  );
});

/** At most this many top-level entries are listed (the Code tab has them all). */
const MAX_ENTRIES = 60;

/** The default branch's latest commit, its top-level files and its README. */
const Files = observer(function Files({owner, repo, repoId}: {owner: string; repo: string; repoId: number}) {
  const pool = usePool();
  const refs = refTable(pool, repoId);
  const branch = refs.defaultBranch;
  const sha = refs.branches.get(branch);
  const r = pool.model('Repository').get(repoId)?.data;
  if (!sha) {
    return (
      <FilesPanel title={<><Icon icon={GitBranch} size="sm"/>Code</>}>
        {r?.empty ? <EmptyRepo owner={owner} repo={repo} repoId={repoId}/> :
          <EmptyState icon={FolderGit2} title="No code on this device yet" description="Its branches have not arrived yet."/>}
      </FilesPanel>
    );
  }
  const title = <RefCommit owner={owner} repo={repo} repoId={repoId} kind="branch" name={branch} sha={sha}/>;
  return <Tree owner={owner} repo={repo} repoId={repoId} sha={sha} branch={branch} title={title}/>;
});

function Tree({owner, repo, repoId, sha, branch, title}: {owner: string; repo: string; repoId: number; sha: string; branch: string; title: ReactNode}) {
  const app = useApp();
  const src = useSource();
  const click = useLinkClick();
  const key = CodeSource.treeKey(repoId, sha, '');
  // The README is asked for with the tree, not after it (README.md, by far the most common name: the server reads
  // and renders it in one round trip; another name is asked once the tree names it), and the highlighter starts
  // meanwhile for its code blocks.
  useEffect(() => {
    void src.renderedAt(repoId, sha, 'README.md', {kind: 'branch', name: branch}).catch(() => undefined);
    whenIdle(() => {
      src.preheat();
    });
  }, [src, repoId, sha, branch]);
  const tree = useLoad(key, () => src.peek<APITree>(key), () => src.tree(repoId, sha, ''));
  const entries = useMemo(() => (tree.state === 'ready' ?
    treeOrder(tree.value.entries) :
    []), [tree]);
  const readme = readmeOf(entries);
  const all = hrefOf(app, codePath(owner, repo, `src/branch/${branch}`));
  return (
    <>
      <FilesPanel title={title} actions={<Button size="sm" variant="ghost" asChild><a href={all} onClick={(e) => click(e, all)}>Browse code</a></Button>}>
        {tree.state === 'ready' ?
          entries.slice(0, MAX_ENTRIES).map((e) => <EntryRow key={e.name} owner={owner} repo={repo} branch={branch} entry={e}/>) :
          <Unloaded loaded={tree} what="This repository's files" skeleton={<div className="px-3 py-3"><SkeletonText lines={5}/></div>}/>}
        {entries.length > MAX_ENTRIES && (
          <ListRow role={undefined} href={all} onClick={(e) => click(e, all)} leading={<Icon icon={Folder} size="sm"/>}>
            {entries.length - MAX_ENTRIES} more
          </ListRow>
        )}
      </FilesPanel>
      {readme && <ReadmePanel repoId={repoId} entry={readme} dir="" at={{kind: 'branch', ref: branch, sha}}/>}
    </>
  );
}

function EntryRow({owner, repo, branch, entry}: {owner: string; repo: string; branch: string; entry: APITreeEntry}) {
  const app = useApp();
  const click = useLinkClick();
  const href = hrefOf(app, codePath(owner, repo, `src/branch/${branch}/${entry.name}`));
  const parts = entryParts(entry);
  return (
    <ListRow role={undefined} href={href} onClick={(e) => click(e, href)} leading={parts.leading} trailing={parts.trailing}>
      {parts.main}
    </ListRow>
  );
}
