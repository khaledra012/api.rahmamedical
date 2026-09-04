export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface UserResponseDto {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResponseDto {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  token: string;
  expiresIn: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: string;
  name?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
