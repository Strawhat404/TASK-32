const ROLE_LABELS = {
  admin: 'Administrator',
  'administrator': 'Administrator',
  moderator: 'Moderator',
  'Moderator': 'Moderator',
  host: 'Store Manager',
  inventory_clerk: 'Inventory Clerk',
  user: 'Customer/Member',
  customer_member: 'Customer/Member',
  store_manager: 'Store Manager',
  'Store Manager': 'Store Manager',
  'Inventory Clerk': 'Inventory Clerk',
  'Customer/Member': 'Customer/Member',
};

const ROLE_ALIASES = {
  admin: ['admin', 'administrator'],
  administrator: ['admin', 'administrator'],
  moderator: ['moderator'],
  'Moderator': ['moderator'],
  host: ['host', 'store_manager', 'store manager'],
  store_manager: ['host', 'store_manager', 'store manager'],
  'Store Manager': ['host', 'store_manager', 'store manager'],
  inventory_clerk: ['inventory_clerk', 'inventory clerk'],
  'Inventory Clerk': ['inventory_clerk', 'inventory clerk'],
  user: ['user', 'customer_member', 'customer/member', 'customer member'],
  customer_member: ['user', 'customer_member', 'customer/member', 'customer member'],
  'Customer/Member': ['user', 'customer_member', 'customer/member', 'customer member'],
};

export function roleLabelFor(role) {
  return ROLE_LABELS[role] || role;
}

export function roleMatches(actualRole, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  const normalizedActual = String(actualRole || '').toLowerCase().replace(/\s+/g, '_');
  const actualAliases = new Set(ROLE_ALIASES[normalizedActual] || [normalizedActual]);

  return allowedRoles.some((role) => {
    const normalizedAllowed = String(role || '').toLowerCase().replace(/\s+/g, '_');
    const allowedAliases = ROLE_ALIASES[normalizedAllowed] || [normalizedAllowed];
    return allowedAliases.some((alias) => actualAliases.has(alias));
  });
}
