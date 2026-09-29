import { UserRole } from './dtos/auth.dtos';

export type Permission =
  | 'products.manage'
  | 'orders.retry'
  | 'cancellations.retry'
  | 'cod_settlements.retry'
  | 'orders.simulate'
  | 'logs.retry'
  | 'users.manage';

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    'products.manage',
    'orders.retry',
    'cancellations.retry',
    'cod_settlements.retry',
    'orders.simulate',
    'logs.retry',
    'users.manage',
  ],
  operator: ['products.manage', 'orders.retry', 'logs.retry'],
  viewer: [],
};

export const hasPermission = (role: UserRole, permission: Permission): boolean =>
  rolePermissions[role]?.includes(permission) || false;
