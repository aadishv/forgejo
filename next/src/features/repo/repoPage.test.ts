// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {describe, expect, test} from 'vitest';
import {fitCount} from '../../ui/Code.tsx';
import {tabOfPath} from './repoPage.tsx';

describe('tabOfPath', () => {
  test('the home and every code view are the Code tab (GitHub keeps Code selected on them)', () => {
    for (const path of [
      '/acme/website',
      '/acme/website/',
      '/-/next/code/acme/website/-',
      '/-/next/code/acme/website/src/branch/main/-',
      '/-/next/code/acme/website/src/branch/main/README.md/-',
      '/-/next/code/acme/website/blame/branch/main/README.md/-',
      '/-/next/code/acme/website/commits/branch/main/-',
      '/-/next/code/acme/website/commit/0123456789abcdef0123456789abcdef01234567/-',
      '/-/next/code/acme/website/compare/main...small/-',
      '/-/next/code/acme/website/branches/-',
      '/-/next/code/acme/website/tags/-',
      '/-/next/code/acme/website/releases/-',
    ]) expect(tabOfPath(path), path).toBe('code');
  });

  test('issues, pull requests and Actions are their own tabs', () => {
    expect(tabOfPath('/acme/website/issues')).toBe('issues');
    expect(tabOfPath('/acme/website/pulls')).toBe('pulls');
    expect(tabOfPath('/-/next/code/acme/website/actions/-')).toBe('actions');
    expect(tabOfPath('/-/next/code/acme/website/actions/runs/4/-')).toBe('actions');
  });

  test('anything else is no tab', () => {
    expect(tabOfPath('/acme')).toBeUndefined();
    expect(tabOfPath('/')).toBeUndefined();
    expect(tabOfPath('/acme/website/wiki')).toBeUndefined();
    expect(tabOfPath('/-/next/code/acme/website/nonsense/-')).toBeUndefined();
    expect(tabOfPath('/-/next/acme/website/settings')).toBeUndefined();
    expect(tabOfPath('/-/next/projects/3')).toBeUndefined();
  });
});

describe('fitCount (a tab bar\'s overflow into More)', () => {
  test('all fit: Infinity', () => {
    expect(fitCount([50, 60, 70], 400, 4, 60)).toBe(Infinity);
  });

  test('the tabs that do not fit beside the menu go into it', () => {
    // 60 (More) + 54 + 64 = 178 ≤ 200; + 74 > 200.
    expect(fitCount([50, 60, 70], 200, 4, 60)).toBe(2);
    expect(fitCount([50, 60, 70], 100, 4, 60)).toBe(0);
  });

  test('a bar not laid out yet (no room, a width unknown or 0) shows every tab', () => {
    expect(fitCount([50, 60], 0, 4, 60)).toBe(Infinity);
    expect(fitCount([50, undefined], 100, 4, 60)).toBe(Infinity);
    expect(fitCount([50, 0], 100, 4, 60)).toBe(Infinity);
  });
});
