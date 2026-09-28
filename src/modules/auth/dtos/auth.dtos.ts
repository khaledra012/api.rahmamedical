export interface LoginRequestDto {
  identifier: string;
  password: string;
}

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface UserResponseDto {
  id: number;
  name: string;
  username: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResponseDto {
  user: {
    id: number;
    name: string;
    username: string | null;
    email: string;
    role: UserRole;
    mustChangePassword: boolean;
  };
  token: string;
  expiresIn: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  username: string | null;
  role: UserRole;
  name?: string;
  mustChangePassword: boolean;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
