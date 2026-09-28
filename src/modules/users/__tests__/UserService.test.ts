import { Op } from 'sequelize';
import { User } from '../../auth/models/User';
import { UserService } from '../services/UserService';
import { ConflictError } from '../../../shared/errors';

jest.mock('../../auth/models/User');

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
    jest.clearAllMocks();
  });

  it('creates an operator with a temporary password requirement', async () => {
    (User.findOne as jest.Mock).mockResolvedValue(null);
    (User.create as jest.Mock).mockImplementation(async (value) => value);

    const result: any = await service.createUser({
      name: 'موظف تشغيل', username: 'operator.one', email: 'operator@example.com', password: 'Temp1234', role: 'operator',
    });

    expect(User.findOne).toHaveBeenCalledWith({
      where: { [Op.or]: [{ email: 'operator@example.com' }, { username: 'operator.one' }] },
    });
    expect(result.mustChangePassword).toBe(true);
    expect(result.role).toBe('operator');
  });

  it('rejects a duplicate username or email', async () => {
    (User.findOne as jest.Mock).mockResolvedValue({ email: 'operator@example.com', username: 'operator.one' });
    await expect(service.createUser({
      name: 'موظف', username: 'operator.one', email: 'operator@example.com', password: 'Temp1234', role: 'viewer',
    })).rejects.toThrow(ConflictError);
  });

  it('allows an admin to disable another non-admin account', async () => {
    const user: any = { id: 2, role: 'operator', isActive: true, email: 'operator@example.com', username: 'operator', save: jest.fn() };
    (User.findByPk as jest.Mock).mockResolvedValue(user);

    await service.updateUser(1, 2, { isActive: false });

    expect(user.isActive).toBe(false);
    expect(user.save).toHaveBeenCalled();
  });

  it('prevents an admin from disabling their own account', async () => {
    (User.findByPk as jest.Mock).mockResolvedValue({ id: 1, role: 'admin', isActive: true });
    await expect(service.updateUser(1, 1, { isActive: false })).rejects.toThrow(ConflictError);
  });

  it('marks a reset password as temporary', async () => {
    const user: any = { id: 2, password: 'old', mustChangePassword: false, save: jest.fn() };
    (User.findByPk as jest.Mock).mockResolvedValue(user);
    await service.resetPassword(2, 'Temp5678');
    expect(user.password).toBe('Temp5678');
    expect(user.mustChangePassword).toBe(true);
  });
});
