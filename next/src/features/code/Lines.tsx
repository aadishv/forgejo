// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

// A virtualized list of fixed-height lines (file views, blame, logs) in the
// page's scroll container. Only the lines in view plus an overscan exist;
// each is a memoized component whose props are its index and its position,
// so a scroll frame mounts the lines coming into view and re-renders none of
// the others (no cascade). Lines move by transform only.

import {useVirtualizer} from '@tanstack/react-virtual';
import {observer} from 'mobx-react-lite';
import {type CSSProperties, memo, type ReactNode, useEffect, useImperativeHandle, useLayoutEffect, useState, type Ref} from 'react';
import {cx} from '../../ui/cx.ts';

/** The height of one line (tokens.css --spacing-line). */
export const LINE = 20;

/** Stable (the virtualizer recomputes every position when its estimate function changes). */
const lineSize = () => LINE;

export interface LinesHandle {
  scrollToLine(index: number): void;
}

interface LinesProps {
  count: number;
  scroller: HTMLElement | null;
  /** Renders line `index`. Keep it stable (useCallback on the data it reads): a new function re-renders every line. */
  line: (index: number) => ReactNode;
  /** Scroll this line into view at mount (a #L12 link). */
  initial?: number | undefined;
  label: string;
  ref?: Ref<LinesHandle>;
  /**
   * Keep the view at the end while it is there (a log that grows). Once on, it keeps following while the view is at
   * the end — also after it turns off, so that the lines that come with the end of a run are scrolled to.
   */
  follow?: boolean;
  /** The longest line, in characters (tabs counted at --code-tab-size): every row is that wide (min-w-lines). */
  chars?: number | undefined;
  /** The gutter is the blame column and a line number. */
  blame?: boolean | undefined;
  /**
   * What stays at the top of the view once the list's top has scrolled past it (the log's step whose lines are at
   * the top), given the first line in view; outside the sideways scroller, so it stays put both ways.
   */
  pinned?: ((top: number) => ReactNode) | undefined;
}

/** A line's width in characters, tabs expanded to the next stop of --code-tab-size (4). */
export function lineChars(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = text.charCodeAt(i) === 9 ? n + TAB - (n % TAB) : n + 1;
  return n;
}

/** The longest of some lines, in characters (lineChars). */
export function maxChars(lines: readonly string[]): number {
  let n = 0;
  for (const l of lines) if (l.length > n || l.includes('\t')) n = Math.max(n, lineChars(l));
  return n;
}

const TAB = 4;

const Line = memo(function Line({index, start, line}: {index: number; start: number; line: (index: number) => ReactNode}) {
  return (
    <div role="listitem" className="absolute inset-x-0 top-0" style={{transform: `translateY(${String(start)}px)`}}>
      {line(index)}
    </div>
  );
});

/** Publishes the scroll container's size as --view-width / --view-height (the w-view and h-view utilities). */
export function useViewSize(scroller: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!scroller) return undefined;
    const set = () => {
      scroller.style.setProperty('--view-width', `${String(scroller.clientWidth)}px`);
      scroller.style.setProperty('--view-height', `${String(scroller.clientHeight)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(scroller);
    return () => {
      ro.disconnect();
    };
  }, [scroller]);
}

/** Where an element starts inside its scroll container (what is above it scrolls with it), px. */
export function useScrollMargin(scroller: HTMLElement | null): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    if (!el || !scroller) return undefined;
    const measure = () => {
      setMargin(Math.round(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop));
    };
    measure();
    // What is above may change height (a header that loads); the list itself never resizes what is above it.
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      ro.disconnect();
    };
  }, [el, scroller]);
  return [setEl, margin];
}

export const Lines = observer(function Lines({count, scroller, line, initial, label, ref, follow = false, chars = 0, blame = false, pinned}: LinesProps) {
  const [at, offset] = useScrollMargin(scroller);
  const v = useVirtualizer({
    count,
    getScrollElement: () => scroller,
    estimateSize: lineSize,
    overscan: 30,
    scrollMargin: offset,
  });
  useImperativeHandle(ref, () => ({
    scrollToLine(index: number) {
      v.scrollToIndex(index, {align: 'center'});
    },
  }), [v]);
  useEffect(() => {
    if (initial !== undefined && scroller) v.scrollToIndex(initial, {align: 'center'});
    // Only at mount (and when the scroll container appears).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);
  // Following: the view stays at the end while the user is there (scrolling up stops it, scrolling back resumes).
  const [stick] = useState(() => ({on: true, followed: false}));
  if (follow) stick.followed = true;
  useEffect(() => {
    if (!follow || !scroller) return undefined;
    const onScroll = () => {
      stick.on = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < LINE * 3;
    };
    scroller.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [follow, scroller, stick]);
  useLayoutEffect(() => {
    // A run that just finished: its last lines and steps arrive with (or after) the end; still followed (QA: the last
    // lines and "Complete job" stayed below the fold).
    if (stick.followed && scroller && stick.on) scroller.scrollTop = scroller.scrollHeight;
  }, [count, follow, scroller, stick]);
  // The pane's width, for the rows pinned to its left edge (w-lines: a log's step headers).
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!pane) return undefined;
    const set = () => {
      pane.style.setProperty('--lines-width', `${String(pane.clientWidth)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(pane);
    return () => {
      ro.disconnect();
    };
  }, [pane]);
  const top = Math.floor(((v.scrollOffset ?? 0) - offset) / LINE);
  const head = pinned && top > 0 && top < count ? pinned(top) : null;
  // Long lines scroll sideways inside the code only (their gutter sticks to its left edge): the page around it — the
  // file's header, a job's steps — stays put (QA verify3: a 36 000 px line widened the whole page). Up and down is
  // still the page's scroll (the virtualizer's).
  // Every row is as wide as the longest (min-w-lines): a short line's gutter stays at the pane's left edge too (QA: on
  // a file with one very long line, scrolling sideways took the other lines' numbers and the #L tint away).
  return (
    <>
      {head && <div className="sticky top-0 z-sticky h-0"><div className="border-b border-border">{head}</div></div>}
      <div ref={setPane} className="overflow-x-auto overflow-y-hidden">
        <div ref={at} role="list" aria-label={label} className={cx('relative min-w-lines font-mono text-code', blame && 'lines-blame')}
          style={{height: v.getTotalSize(), '--code-chars': chars} as CSSProperties}>
          {v.getVirtualItems().map((it) => <Line key={it.index} index={it.index} start={it.start - offset} line={line}/>)}
        </div>
      </div>
    </>
  );
});
