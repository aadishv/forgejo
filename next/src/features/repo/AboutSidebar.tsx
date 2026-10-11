// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// A repository home's side pane, in GitHub's order: About (description,
// website, topics, where it was forked from, Readme / License / Activity,
// stars, watchers, forks, then the clone URL and the archive), Releases
// (the count, the latest, Tags) and Languages. Everything but the languages
// comes from the pool and the code cache (no request of its own: the README
// and license links read the root tree the file list loads); the languages
// are asked for once per commit of the default branch and kept in the code
// cache. Each part observes only the fields it shows.

import {Link} from '@tanstack/react-router';
import {Activity, BookOpen, Copy, Eye, FileArchive, GitFork, Link2, Scale, Star, Tag} from 'lucide-react';
import {observer} from 'mobx-react-lite';
import {Fragment, type MouseEvent, useId} from 'react';
import {CLASSIC_HINT, classicHref} from '../../app/classic.ts';
import {sitePath} from '../../app/config.ts';
import {hrefOf, useLinkClick} from '../../app/links.ts';
import {notify} from '../../app/notices.ts';
import {codePath} from '../../app/paths.ts';
import {useApp} from '../../app/store.ts';
import {CodeSource} from '../../code/source.ts';
import type {APITree} from '../../protocol/types.gen.ts';
import {AsideLink, AsideLinks, AsideSection, Badge, Icon, IconButton, type LucideIcon, ShareBar, TextLink} from '../../ui/index.ts';
import {refTable, useLoad, useSource} from '../code/hooks.ts';
import {codeTo} from '../code/nav.tsx';
import {README_ID, readmeOf} from '../code/Rendered.tsx';
import {cloneUrl} from '../code/states.tsx';
import {usePool} from '../issues/cells.tsx';
import {fullDate, shortDate} from '../issues/format.ts';
import {languageShares, licenseOf, plural, releaseSummary, tagCount} from './about.ts';

interface RepoProps {
  owner: string;
  repo: string;
  repoId: number;
}

export function AboutSidebar(props: RepoProps) {
  return (
    <>
      <AsideSection title="About">
        <Description repoId={props.repoId}/>
        <ForkOf repoId={props.repoId}/>
        <AsideLinks label="Repository">
          <TreeLinks {...props}/>
          <AsideLink icon={Activity}><Link to="/$owner/$repo/activity" params={{owner: props.owner, repo: props.repo}}>Activity</Link></AsideLink>
          <Counts {...props}/>
        </AsideLinks>
        <CloneField owner={props.owner} repo={props.repo}/>
        <Archive {...props}/>
      </AsideSection>
      <Releases {...props}/>
      <Languages repoId={props.repoId}/>
    </>
  );
}

/** The description, the website and the topics (or that there are none). */
const Description = observer(function Description({repoId}: {repoId: number}) {
  const r = usePool().model('Repository').get(repoId);
  if (!r) return null;
  const description = r.get('description');
  const website = r.get('website');
  const topics = r.get('topics');
  const site = /^https?:\/\//.test(website) ? website : '';
  if (!description && !site && topics.length === 0) return <p className="text-base text-fg-subtle">No description, website, or topics provided.</p>;
  return (
    <>
      {description && <p className="text-md text-fg">{description}</p>}
      {site && (
        <AsideLinks>
          <AsideLink icon={Link2} tone="accent"><a href={site} target="_blank" rel="noopener noreferrer"><span className="truncate">{site.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span></a></AsideLink>
        </AsideLinks>
      )}
      {topics.length > 0 && <ul aria-label="Topics" className="flex flex-wrap gap-1">{topics.map((t) => <li key={t} className="flex"><Badge tone="accent" round>{t}</Badge></li>)}</ul>}
    </>
  );
});

/** "Forked from owner/name": the parent repository, when it is on this device. */
const ForkOf = observer(function ForkOf({repoId}: {repoId: number}) {
  const pool = usePool();
  const r = pool.model('Repository').get(repoId);
  const parentId = r?.get('fork') ? r.get('parent_id') : 0;
  const p = parentId > 0 ? pool.model('Repository').get(parentId) : undefined;
  if (!p) return null;
  return (
    <p className="flex min-w-0 items-center gap-2 text-base text-fg-muted">
      <Icon icon={GitFork} size="sm"/>
      <span className="shrink-0">Forked from</span>
      <TextLink><Link to="/$owner/$repo" params={{owner: p.get('owner_name'), repo: p.get('name')}} activeOptions={{exact: true}}>{p.get('full_name')}</Link></TextLink>
    </p>
  );
});

/** Readme (the panel below the files) and License (the file), read from the default branch's root tree. */
const TreeLinks = observer(function TreeLinks({owner, repo, repoId}: RepoProps) {
  const refs = refTable(usePool(), repoId);
  const sha = refs.branches.get(refs.defaultBranch);
  if (!sha) return null;
  return <RootFiles owner={owner} repo={repo} repoId={repoId} branch={refs.defaultBranch} sha={sha}/>;
});

function RootFiles({owner, repo, repoId, branch, sha}: RepoProps & {branch: string; sha: string}) {
  const app = useApp();
  const src = useSource();
  const click = useLinkClick();
  const key = CodeSource.treeKey(repoId, sha, '');
  // The same request as the file list's (one in flight per key): its answer paints both.
  const tree = useLoad(key, () => src.peek<APITree>(key), () => src.tree(repoId, sha, ''));
  if (tree.state !== 'ready') return null;
  const readme = readmeOf(tree.value.entries);
  const license = licenseOf(tree.value.entries);
  const licenseHref = license && hrefOf(app, codePath(owner, repo, `src/branch/${branch}/${license.name}`));
  const toReadme = (e: MouseEvent) => {
    const panel = document.getElementById(README_ID);
    if (!panel) return;
    e.preventDefault();
    panel.scrollIntoView({block: 'start'});
  };
  return (
    <>
      {readme && <AsideLink icon={BookOpen}><a href={`#${README_ID}`} onClick={toReadme}>Readme</a></AsideLink>}
      {license && licenseHref && (
        <AsideLink icon={Scale}><a href={licenseHref} title={license.name} onClick={(e) => click(e, licenseHref)}>View license</a></AsideLink>
      )}
    </>
  );
}

/** A row that opens a classic page (marked and hinted like every classic exit). */
function ClassicRow({owner, repo, path, icon, count, children}: {owner: string; repo: string; path: string; icon: LucideIcon; count?: number; children: string}) {
  const app = useApp();
  return (
    <AsideLink icon={icon} count={count}>
      <a href={classicHref(app, `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${path}`)} data-classic="" title={CLASSIC_HINT}>{children}</a>
    </AsideLink>
  );
}

/** Stars, watchers and forks: one cell each (a new star re-renders its own line only). */
function Counts(props: RepoProps) {
  return (
    <>
      <Count {...props} field="stars_count" path="stars" icon={Star} one="star"/>
      <Count {...props} field="watchers_count" path="watchers" icon={Eye} one="watching" many="watching"/>
      <Count {...props} field="forks_count" path="forks" icon={GitFork} one="fork"/>
    </>
  );
}

const Count = observer(function Count({owner, repo, repoId, field, path, icon, one, many}: RepoProps & {field: 'stars_count' | 'watchers_count' | 'forks_count'; path: string; icon: LucideIcon; one: string; many?: string}) {
  const r = usePool().model('Repository').get(repoId);
  if (!r) return null;
  const n = r.get(field);
  return <ClassicRow owner={owner} repo={repo} path={path} icon={icon} count={n}>{plural(n, one, many)}</ClassicRow>;
});

/**
 * The clone URL over HTTP(S), compact: a small label, the URL whole (QA: a field cut it to its host; wrapped after a
 * slash when it is longer than the pane, never mid-word; one click selects it all) and a copy button.
 */
function CloneField({owner, repo}: {owner: string; repo: string}) {
  const app = useApp();
  const clone = cloneUrl(app.config.app_url, owner, repo);
  const id = useId();
  const copy = () => {
    void navigator.clipboard.writeText(clone).then(() => {
      notify(app, {tone: 'success', title: 'Clone URL copied'});
    }, () => undefined);
  };
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col gap-1">
      <span id={id} className="text-sm text-fg-subtle">Clone over HTTPS</span>
      <span className="flex min-w-0 items-start gap-1">
        <code className="min-w-0 flex-1 py-0.5 font-mono text-code break-normal text-fg select-all">
          {clone.split(/(?<=\/)/).map((part, i) => <Fragment key={i}>{part}<wbr/></Fragment>)}
        </code>
        <IconButton size="sm" icon={Copy} label="Copy the clone URL" onClick={copy}/>
      </span>
    </div>
  );
}

/** The default branch as a ZIP archive (not for an empty repository: there is nothing to archive). */
const Archive = observer(function Archive({owner, repo, repoId}: RepoProps) {
  const app = useApp();
  const r = usePool().model('Repository').get(repoId);
  if (!r || r.get('empty')) return null;
  const branch = r.get('default_branch');
  return (
    <AsideLinks>
      <AsideLink icon={FileArchive}>
        <a href={sitePath(app.config, `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archive/${encodeURIComponent(branch)}.zip`)} download>Download ZIP</a>
      </AsideLink>
    </AsideLinks>
  );
});

/** Releases: the count, the latest (or that there are none), the rest, and the tags (their only way in). */
const Releases = observer(function Releases({owner, repo, repoId}: RepoProps) {
  const pool = usePool();
  const all = [...pool.model('Release').by('repo_id', repoId)].map((x) => x.data);
  const {count, latest} = releaseSummary(all);
  const tags = tagCount(all);
  const releasesTo = codeTo(owner, repo, 'releases');
  return (
    <AsideSection title={count > 0 ? <TextLink><Link {...releasesTo}>Releases</Link></TextLink> : 'Releases'} count={count > 0 ? count : undefined}>
      {latest ?
        <Link {...releasesTo} className="interactive group flex min-w-0 items-start gap-2">
          <span className="flex h-row shrink-0 items-center text-success"><Icon icon={Tag}/></span>
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-base font-semibold text-fg group-hover:text-accent-fg">{latest.name || latest.tag_name}</span>
              {latest.prerelease ? <Badge tone="warning" round>Pre-release</Badge> : <Badge tone="success" round>Latest</Badge>}
            </span>
            <time dateTime={latest.created_at} title={fullDate(latest.created_at)} className="text-sm text-fg-subtle">{shortDate(latest.created_at)}</time>
          </span>
        </Link> :
        <p className="text-base text-fg-subtle">No releases published.</p>}
      {count > 1 && <p className="text-sm"><TextLink><Link {...releasesTo}>+ {count - 1} {plural(count - 1, 'release')}</Link></TextLink></p>}
      {tags > 0 && (
        <AsideLinks>
          <AsideLink icon={Tag} count={tags}><Link {...codeTo(owner, repo, 'tags')}>{plural(tags, 'tag')}</Link></AsideLink>
        </AsideLinks>
      )}
    </AsideSection>
  );
});

/** Languages: the default branch's, by size (nothing until known: it is the last section, nothing moves). */
const Languages = observer(function Languages({repoId}: {repoId: number}) {
  const refs = refTable(usePool(), repoId);
  const sha = refs.branches.get(refs.defaultBranch);
  if (!sha) return null;
  return <LanguagesAt repoId={repoId} sha={sha}/>;
});

function LanguagesAt({repoId, sha}: {repoId: number; sha: string}) {
  const src = useSource();
  const key = CodeSource.languagesKey(repoId, sha);
  const stats = useLoad(key, () => src.peek<Record<string, number>>(key), () => src.languages(repoId, sha));
  const shares = stats.state === 'ready' ? languageShares(stats.value) : [];
  if (!shares.length) return null;
  return (
    <AsideSection title="Languages">
      <ShareBar label="Languages" shares={shares}/>
    </AsideSection>
  );
}
