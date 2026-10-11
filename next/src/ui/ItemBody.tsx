// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import type {ReactNode} from 'react';
import {Icon, type LucideIcon} from './Icon.tsx';
import {Shortcut} from './Kbd.tsx';
import {iconSlot} from './recipes.ts';

export interface ItemBodyProps {
  icon?: LucideIcon | undefined;
  /** Instead of an icon (an avatar). */
  leading?: ReactNode;
  /** Muted text after the label (a repository, a state). */
  meta?: ReactNode;
  shortcut?: string | undefined;
  children: ReactNode;
}

/** The inside of a menu row and a command row: icon, label, muted detail, shortcut hint. */
export function ItemBody({icon, leading, meta, shortcut, children}: ItemBodyProps) {
  return (
    <>
      {/* One leading slot's width for icons, dots and avatars alike: every row's text starts at the same x (QA: label
          rows, with an 8 px dot, started 8 px left of the others). */}
      {icon ? <Icon icon={icon} className="text-fg-muted group-data-disabled:text-fg-subtle"/> : leading !== undefined && leading !== null && <span className={iconSlot}>{leading}</span>}
      <span className={meta === undefined ? 'min-w-0 flex-1 truncate' : 'min-w-0 truncate'}>{children}</span>
      {meta !== undefined && <span className="min-w-0 flex-1 truncate text-sm text-fg-subtle">{meta}</span>}
      {shortcut && <Shortcut keys={shortcut} className="group-data-disabled:opacity-disabled"/>}
    </>
  );
}
