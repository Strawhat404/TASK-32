import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_SRC = path.resolve(__dirname, '../frontend/src');

// ---------------------------------------------------------------------------
// 1. Frontend constants module — role navigation, tab config, permissions
// ---------------------------------------------------------------------------

import {
  ROLE_LABELS,
  NAV_BY_ROLE,
  TAB_LABELS,
  mapRole,
  allowedTabs,
  canModerate,
  canAdminister,
  canManageBookings,
  tabVisible,
} from '../frontend/src/lib/constants.js';

test('ROLE_LABELS maps every backend role to a display label', () => {
  assert.equal(ROLE_LABELS.admin, 'Administrator');
  assert.equal(ROLE_LABELS.host, 'Store Manager');
  assert.equal(ROLE_LABELS.moderator, 'Moderator');
  assert.equal(ROLE_LABELS.user, 'Customer/Member');
  assert.equal(ROLE_LABELS.inventory_clerk, 'Inventory Clerk');
});

test('NAV_BY_ROLE defines tabs for all five roles', () => {
  const roles = ['Administrator', 'Store Manager', 'Inventory Clerk', 'Moderator', 'Customer/Member'];
  for (const role of roles) {
    assert.ok(Array.isArray(NAV_BY_ROLE[role]), `NAV_BY_ROLE missing entry for ${role}`);
    assert.ok(NAV_BY_ROLE[role].length > 0, `NAV_BY_ROLE[${role}] should have at least one tab`);
  }
});

test('Administrator has access to all seven tabs', () => {
  const adminTabs = NAV_BY_ROLE['Administrator'];
  assert.equal(adminTabs.length, 7);
  for (const tab of ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master']) {
    assert.ok(adminTabs.includes(tab), `Administrator missing tab: ${tab}`);
  }
});

test('Moderator only has forum access', () => {
  assert.deepEqual(NAV_BY_ROLE['Moderator'], ['forum']);
});

test('Customer/Member has bookings, forum, scoring, commerce', () => {
  const tabs = NAV_BY_ROLE['Customer/Member'];
  assert.equal(tabs.length, 4);
  assert.ok(tabs.includes('bookings'));
  assert.ok(tabs.includes('forum'));
  assert.ok(tabs.includes('scoring'));
  assert.ok(tabs.includes('commerce'));
  assert.ok(!tabs.includes('master'), 'Customer/Member should not have master data access');
});

test('Inventory Clerk has scripts, resources, master only', () => {
  assert.deepEqual(NAV_BY_ROLE['Inventory Clerk'], ['scripts', 'resources', 'master']);
});

test('TAB_LABELS maps all tab keys to display names', () => {
  const expectedKeys = ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master'];
  for (const key of expectedKeys) {
    assert.ok(typeof TAB_LABELS[key] === 'string', `TAB_LABELS missing key: ${key}`);
    assert.ok(TAB_LABELS[key].length > 0, `TAB_LABELS[${key}] is empty`);
  }
});

test('mapRole resolves backend role aliases to display labels', () => {
  assert.equal(mapRole('admin'), 'Administrator');
  assert.equal(mapRole('host'), 'Store Manager');
  assert.equal(mapRole('user'), 'Customer/Member');
  assert.equal(mapRole('moderator'), 'Moderator');
  assert.equal(mapRole('inventory_clerk'), 'Inventory Clerk');
});

test('mapRole returns input unchanged for unknown roles', () => {
  assert.equal(mapRole('UnknownRole'), 'UnknownRole');
});

test('allowedTabs returns correct tabs for each role', () => {
  assert.equal(allowedTabs('Administrator').length, 7);
  assert.deepEqual(allowedTabs('Moderator'), ['forum']);
  assert.equal(allowedTabs('Customer/Member').length, 4);
  assert.deepEqual(allowedTabs('NonExistentRole'), []);
});

test('canModerate returns true only for Administrator and Moderator', () => {
  assert.equal(canModerate('Administrator'), true);
  assert.equal(canModerate('Moderator'), true);
  assert.equal(canModerate('Store Manager'), false);
  assert.equal(canModerate('Customer/Member'), false);
  assert.equal(canModerate('Inventory Clerk'), false);
});

test('canAdminister returns true only for Administrator and Store Manager', () => {
  assert.equal(canAdminister('Administrator'), true);
  assert.equal(canAdminister('Store Manager'), true);
  assert.equal(canAdminister('Moderator'), false);
  assert.equal(canAdminister('Customer/Member'), false);
});

test('canManageBookings returns true only for Administrator and Store Manager', () => {
  assert.equal(canManageBookings('Administrator'), true);
  assert.equal(canManageBookings('Store Manager'), true);
  assert.equal(canManageBookings('Customer/Member'), false);
});

test('tabVisible checks role-tab access correctly', () => {
  assert.equal(tabVisible('Administrator', 'master'), true);
  assert.equal(tabVisible('Moderator', 'master'), false);
  assert.equal(tabVisible('Customer/Member', 'commerce'), true);
  assert.equal(tabVisible('Customer/Member', 'scripts'), false);
  assert.equal(tabVisible('Inventory Clerk', 'master'), true);
  assert.equal(tabVisible('Inventory Clerk', 'forum'), false);
});

// ---------------------------------------------------------------------------
// 2. Svelte component compilation — verify all .svelte files parse correctly
// ---------------------------------------------------------------------------

test('all Svelte components compile without errors', async () => {
  // Resolve svelte/compiler from the frontend's own node_modules
  const require = createRequire(path.resolve(__dirname, '../frontend/package.json'));
  const compilerPath = require.resolve('svelte/compiler');
  const { compile } = await import(compilerPath);

  const svelteFiles = [];
  function findSvelteFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) findSvelteFiles(full);
      else if (entry.name.endsWith('.svelte')) svelteFiles.push(full);
    }
  }
  findSvelteFiles(FRONTEND_SRC);

  assert.ok(svelteFiles.length >= 4, `Expected at least 4 .svelte files, found ${svelteFiles.length}`);

  for (const file of svelteFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(FRONTEND_SRC, file);
    let result;
    try {
      result = compile(source, {
        filename: file,
        generate: false,
      });
    } catch (err) {
      assert.fail(`Svelte compilation failed for ${relativePath}: ${err.message}`);
    }
    assert.ok(result, `Compilation result missing for ${relativePath}`);
    assert.ok(!result.warnings?.some(w => w.code === 'parse-error'),
      `Parse error in ${relativePath}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Component structure validation — verify expected exports and props
// ---------------------------------------------------------------------------

test('ForumSectionTree.svelte exports expected props', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'components/ForumSectionTree.svelte'), 'utf8');
  const expectedProps = ['sections', 'selectedSectionId', 'canModerate', 'buttonClasses', 'onSelect', 'onModerate'];
  for (const prop of expectedProps) {
    assert.ok(source.includes(`export let ${prop}`), `ForumSectionTree missing prop: ${prop}`);
  }
});

test('ForumSectionTree.svelte is recursive (self-references)', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'components/ForumSectionTree.svelte'), 'utf8');
  assert.ok(source.includes('ForumSectionTree'), 'ForumSectionTree should reference itself for recursion');
  assert.ok(source.includes('children'), 'ForumSectionTree should render children');
});

test('CommerceTab.svelte exports token prop and has core commerce functions', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'components/CommerceTab.svelte'), 'utf8');
  assert.ok(source.includes('export let token'), 'CommerceTab missing token prop');
  assert.ok(source.includes('loadCart'), 'CommerceTab missing loadCart function');
  assert.ok(source.includes('addToCart'), 'CommerceTab missing addToCart function');
  assert.ok(source.includes('/api/commerce/'), 'CommerceTab should call commerce API');
});

test('MasterDataTab.svelte exports token prop and manages master data sections', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'components/MasterDataTab.svelte'), 'utf8');
  assert.ok(source.includes('export let token'), 'MasterDataTab missing token prop');
  assert.ok(source.includes('/api/master/'), 'MasterDataTab should call master data API');
  assert.ok(source.includes('skus'), 'MasterDataTab should manage SKUs');
  assert.ok(source.includes('customers'), 'MasterDataTab should manage customers');
});

test('App.svelte imports all child components', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'App.svelte'), 'utf8');
  assert.ok(source.includes("import ForumSectionTree"), 'App missing ForumSectionTree import');
  assert.ok(source.includes("import CommerceTab"), 'App missing CommerceTab import');
  assert.ok(source.includes("import MasterDataTab"), 'App missing MasterDataTab import');
});

test('App.svelte imports shared constants from lib/constants.js', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'App.svelte'), 'utf8');
  assert.ok(source.includes("from './lib/constants.js'"), 'App should import from lib/constants.js');
});

test('main.js mounts App to #app element', () => {
  const source = fs.readFileSync(path.join(FRONTEND_SRC, 'main.js'), 'utf8');
  assert.ok(source.includes("import App from"), 'main.js must import App');
  assert.ok(source.includes("getElementById('app')") || source.includes('getElementById("app")'),
    'main.js must target #app element');
});

// ---------------------------------------------------------------------------
// 4. Frontend API path validation — ensure no hardcoded hosts
// ---------------------------------------------------------------------------

test('frontend API calls use relative paths (no hardcoded hosts)', () => {
  function readAllFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...readAllFiles(full));
      else if (/\.(js|svelte)$/.test(entry.name)) results.push({ path: full, content: fs.readFileSync(full, 'utf8') });
    }
    return results;
  }

  const files = readAllFiles(FRONTEND_SRC);
  for (const { path: filePath, content } of files) {
    const rel = path.relative(FRONTEND_SRC, filePath);
    assert.ok(!content.includes('localhost:3443'), `${rel} contains hardcoded localhost:3443`);
    assert.ok(!/https?:\/\/[^"'`\s]*\/api/.test(content), `${rel} contains absolute API URL`);
  }
});

// ---------------------------------------------------------------------------
// 5. Role ↔ tab navigation consistency
// ---------------------------------------------------------------------------

test('every tab referenced in NAV_BY_ROLE exists in TAB_LABELS', () => {
  const allTabsInNav = new Set();
  for (const tabs of Object.values(NAV_BY_ROLE)) {
    for (const tab of tabs) allTabsInNav.add(tab);
  }
  for (const tab of allTabsInNav) {
    assert.ok(tab in TAB_LABELS, `Tab '${tab}' in NAV_BY_ROLE has no entry in TAB_LABELS`);
  }
});

test('every tab in TAB_LABELS is assigned to at least one role', () => {
  const allTabsInNav = new Set();
  for (const tabs of Object.values(NAV_BY_ROLE)) {
    for (const tab of tabs) allTabsInNav.add(tab);
  }
  for (const tab of Object.keys(TAB_LABELS)) {
    assert.ok(allTabsInNav.has(tab), `Tab '${tab}' in TAB_LABELS is not assigned to any role`);
  }
});
