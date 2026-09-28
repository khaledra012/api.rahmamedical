import { AuthService } from '../services/AuthService';
import { User } from '../models/User';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../../shared/errors';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { Op } from 'sequelize';

jest.mock('../models/User');

describe('AuthService Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('login()', () => {
    it('should successfully authenticate user with valid email and password', async () => {
      const mockUser = {
        id: 1,
        name: 'مدير النظام',
        username: 'admin',
        email: 'admin@daftra-sync.com',
        role: 'admin',
        isActive: true,
        mustChangePassword: false,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.login({
        identifier: 'admin@daftra-sync.com',
        password: 'Admin@2026',
      });

      expect(User.findOne).toHaveBeenCalledWith({
        where: { [Op.or]: [{ email: 'admin@daftra-sync.com' }, { username: 'admin@daftra-sync.com' }] },
      });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('Admin@2026');
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toHaveProperty('token');
      expect(result.user).toEqual({
        id: 1,
        name: 'مدير النظام',
        username: 'admin',
        email: 'admin@daftra-sync.com',
        role: 'admin',
        mustChangePassword: false,
      });
    });

    it('should throw UnauthorizedError when user email is not found', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'unknown@daftra-sync.com',
          password: 'Password123',
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user account is inactive (disabled)', async () => {
      const inactiveUser = {
        id: 2,
        email: 'blocked@daftra-sync.com',
        isActive: false,
      };

      (User.findOne as jest.Mock).mockResolvedValue(inactiveUser);

      await expect(
        authService.login({
          identifier: 'blocked@daftra-sync.com',
          password: 'Password123',
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when password does not match', async () => {
      const mockUser = {
        id: 1,
        email: 'admin@daftra-sync.com',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(false), // Password mismatch
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.login({
          identifier: 'admin@daftra-sync.com',
          password: 'WrongPassword',
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('verifyToken()', () => {
    it('should return decoded user payload for a valid JWT token', () => {
      const payload = {
        id: 1,
        email: 'admin@daftra-sync.com',
        username: 'admin',
        role: 'admin',
        mustChangePassword: false,
      };
      const token = jwt.sign(payload, env.jwt.secret);

      const decoded = authService.verifyToken(token);
      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw UnauthorizedError for an invalid or tampered JWT token', () => {
      expect(() => {
        authService.verifyToken('invalid.token.string');
      }).toThrow(UnauthorizedError);
    });
  });

  describe('getCurrentUser()', () => {
    it('should return user profile by id if user exists and is active', async () => {
      const mockUser = {
        id: 1,
        name: 'مدير النظام',
        username: 'admin',
        email: 'admin@daftra-sync.com',
        role: 'admin',
        isActive: true,
        mustChangePassword: false,
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const user = await authService.getCurrentUser(1);
      expect(user).toEqual(mockUser);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(authService.getCurrentUser(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('changePassword()', () => {
    it('should successfully update password when current password is valid', async () => {
      const mockUser: any = {
        id: 1,
        password: 'old_hashed_password',
        mustChangePassword: true,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      await authService.changePassword(1, {
        currentPassword: 'CurrentPassword123',
        newPassword: 'NewSecurePassword456',
      });

      expect(mockUser.comparePassword).toHaveBeenCalledWith('CurrentPassword123');
      expect(mockUser.password).toBe('NewSecurePassword456');
      expect(mockUser.mustChangePassword).toBe(false);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when current password is incorrect', async () => {
      const mockUser: any = {
        id: 1,
        comparePassword: jest.fn().mockResolvedValue(false),
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.changePassword(1, {
          currentPassword: 'WrongPassword',
          newPassword: 'NewSecurePassword456',
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when new password is less than 6 characters', async () => {
      const mockUser: any = {
        id: 1,
        comparePassword: jest.fn().mockResolvedValue(true),
      };

      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.changePassword(1, {
          currentPassword: 'CurrentPassword123',
          newPassword: '123',
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
