import { Op } from 'sequelize';
import { User } from '../../auth/models/User';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { CreateUserDto, UpdateUserDto } from '../dtos/user.dtos';

export class UserService {
  async listUsers(): Promise<User[]> {
    return User.findAll({ order: [['createdAt', 'DESC']] });
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();
    await this.assertUnique(email, username);

    return User.create({
      name: dto.name.trim(),
      username,
      email,
      password: dto.password,
      role: dto.role,
      isActive: true,
      mustChangePassword: true,
    });
  }

  async updateUser(actorUserId: number, userId: number, dto: UpdateUserDto): Promise<User> {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('المستخدم غير موجود');

    if (user.role === 'admin' && user.id !== actorUserId) {
      throw new ConflictError('لا يمكن تعديل حساب مدير نظام آخر من هذه الشاشة');
    }
    if (user.id === actorUserId && (dto.isActive === false || dto.role !== undefined)) {
      throw new ConflictError('لا يمكنك تعطيل حسابك أو إزالة صلاحية المدير من نفسك');
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    const nextUsername = dto.username?.trim().toLowerCase();
    if (nextEmail || nextUsername) {
      await this.assertUnique(nextEmail || user.email, nextUsername || user.username || '', user.id);
    }

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (nextEmail !== undefined) user.email = nextEmail;
    if (nextUsername !== undefined) user.username = nextUsername;
    if (dto.role !== undefined && user.role !== 'admin') user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await user.save();
    return user;
  }

  async resetPassword(userId: number, password: string): Promise<User> {
    const user = await User.findByPk(userId);
    if (!user) throw new NotFoundError('المستخدم غير موجود');
    if (!password || password.trim().length < 6) {
      throw new ValidationError('كلمة المرور المؤقتة يجب ألا تقل عن 6 خانات');
    }
    user.password = password.trim();
    user.mustChangePassword = true;
    await user.save();
    return user;
  }

  private async assertUnique(email: string, username: string, excludeId?: number): Promise<void> {
    const where: any = {
      [Op.or]: [{ email }, { username }],
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await User.findOne({ where });
    if (existing) {
      if (existing.email === email) throw new ConflictError('البريد الإلكتروني مستخدم بالفعل');
      throw new ConflictError('اسم المستخدم مستخدم بالفعل');
    }
  }
}

export const userService = new UserService();
