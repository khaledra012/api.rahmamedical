import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { LoginRequestDto, LoginResponseDto, AuthenticatedUser, ChangePasswordDto } from '../dtos/auth.dtos';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../../shared/errors';
import { env } from '../../../config/env';

export class AuthService {
  /**
   * Authenticate user with email and password
   */
  public async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const email = dto.email.trim().toLowerCase();

    // 1. Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    // 2. Check if account is active (handle both camelCase and snake_case safely)
    const isUserActive = user.isActive ?? (user as any).is_active ?? true;
    if (!isUserActive) {
      throw new ForbiddenError('تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة');
    }

    // 3. Verify password
    const isPasswordValid = await user.comparePassword(dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    // 4. Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // 5. Generate JWT Token
    const payload: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn as any,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
      expiresIn: env.jwt.expiresIn,
    };
  }

  /**
   * Verify and decode a JWT token
   */
  public verifyToken(token: string): AuthenticatedUser {
    try {
      const decoded = jwt.verify(token, env.jwt.secret) as AuthenticatedUser;
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('انتهت صلاحية جلسة تسجيل الدخول، يرجى الدخول مجدداً');
      }
      throw new UnauthorizedError('رمز التحقق غير صالح أو تالف');
    }
  }

  /**
   * Get user profile by ID
   */
  public async getCurrentUser(userId: number): Promise<User> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('المستخدم غير موجود');
    }
    const isUserActive = user.isActive ?? (user as any).is_active ?? true;
    if (!isUserActive) {
      throw new NotFoundError('المستخدم غير نشط أو تم تعطيله');
    }
    return user;
  }

  /**
   * Change user password
   */
  public async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('المستخدم غير موجود');
    }

    const isMatch = await user.comparePassword(dto.currentPassword);
    if (!isMatch) {
      throw new UnauthorizedError('كلمة المرور الحالية غير صحيحة');
    }

    if (!dto.newPassword || dto.newPassword.trim().length < 6) {
      throw new UnauthorizedError('كلمة المرور الجديدة يجب ألا تقل عن 6 خانات');
    }

    user.password = dto.newPassword.trim();
    await user.save();
  }
}

export const authService = new AuthService();
