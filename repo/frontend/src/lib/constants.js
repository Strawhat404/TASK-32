export const ROLE_LABELS = {
  admin: 'Administrator',
  moderator: 'Moderator',
  host: 'Store Manager',
  user: 'Customer/Member',
  inventory_clerk: 'Inventory Clerk',
  store_manager: 'Store Manager',
  customer_member: 'Customer/Member',
};

export const NAV_BY_ROLE = {
  Administrator: ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master'],
  'Store Manager': ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master'],
  'Inventory Clerk': ['scripts', 'resources', 'master'],
  Moderator: ['forum'],
  'Customer/Member': ['bookings', 'forum', 'scoring', 'commerce'],
};

export const TAB_LABELS = {
  scripts: 'Script Manager',
  resources: 'Resource Scheduler',
  bookings: 'Bookings',
  forum: 'Forum',
  scoring: 'Scoring',
  commerce: 'Shop & Checkout',
  master: 'Master Data',
};

export function mapRole(role) {
  return ROLE_LABELS[role] || role;
}

export function allowedTabs(roleLabel) {
  return NAV_BY_ROLE[roleLabel] || [];
}

export function canModerate(roleLabel) {
  return roleLabel === 'Administrator' || roleLabel === 'Moderator';
}

export function canAdminister(roleLabel) {
  return roleLabel === 'Administrator' || roleLabel === 'Store Manager';
}

export function canManageBookings(roleLabel) {
  return roleLabel === 'Administrator' || roleLabel === 'Store Manager';
}

export function tabVisible(roleLabel, tab) {
  return allowedTabs(roleLabel).includes(tab);
}
