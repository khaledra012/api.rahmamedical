import { UserRole } from '../../auth/dtos/auth.dtos';

export interface CreateUserDto {
  name: string;
  username: string;
  email: string;
  password: string;
  role: Exclude<UserRole, 'admin'>;
}

export interface UpdateUserDto {
  name?: string;
  username?: string;
  email?: string;
  role?: Exclude<UserRole, 'admin'>;
  isActive?: boolean;
}
