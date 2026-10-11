// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {useRef} from 'react';

/** Whether an element is inside an open dialog (a closing one is data-state="closed" while it fades out). */
function inOpenDialog(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    const role = p.getAttribute('role');
    if ((role === 'dialog' || role === 'alertdialog') && p.getAttribute('data-state') === 'open') return true;
  }
  return false;
}

/** Whether an element is inside a dialog that is closing (data-state="closed" while it fades out). */
function inClosingDialog(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    const role = p.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog') return p.getAttribute('data-state') === 'closed';
  }
  return false;
}

/**
 * Radix returns focus to a dialog's trigger, but a dialog opened from the
 * keyboard (⌘K, ?) has none: focus would fall to <body>. These handlers
 * remember what had focus when the dialog opened and put it back on close.
 */
export function useReturnFocus(restore: () => boolean = () => true): {onOpenAutoFocus: () => void; onCloseAutoFocus: (e: Event) => void} {
  const before = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const el = document.activeElement;
      before.current = el instanceof HTMLElement && el !== document.body ? el : null;
    },
    onCloseAutoFocus: (e) => {
      const el = before.current;
      before.current = null;
      // `restore` false (a command that took the user elsewhere): the focus goes to the page, not back to the
      // control that opened the dialog (whose tooltip would then cover the new page).
      if (!restore()) {
        e.preventDefault();
        // Only the opener (the sidebar link) or the closing dialog's own field lets go: a field the command focused
        // keeps the focus, and what the user typed there meanwhile — another dialog's (⌘K → Create an issue: QA
        // verify3, blurred at about 300 ms, the title was lost) or the page's (⌘K → Add a column: its name field
        // closed on that blur).
        const a = document.activeElement;
        if (a instanceof HTMLElement && a !== document.body && !inOpenDialog(a) && (a === el || inClosingDialog(a))) a.blur();
        return;
      }
      if (el?.isConnected) {
        e.preventDefault();
        el.focus({preventScroll: true});
      }
    },
  };
}
