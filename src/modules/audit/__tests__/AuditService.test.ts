import { AuditLog } from '../models/AuditLog';
import { AuditService } from '../services/AuditService';

jest.mock('../models/AuditLog');

describe('AuditService', () => {
  it('records the actor and masks passwords in details', async () => {
    (AuditLog.create as jest.Mock).mockImplementation(async (value) => value);
    const service = new AuditService();

    const result: any = await service.record({
      user: { id: 7, name: 'موظف', email: 'operator@example.com', role: 'operator' },
      action: 'USER_RESET_PASSWORD',
      method: 'POST',
      path: '/api/users/2/reset-password',
      entityType: 'USER',
      entityId: 2,
      status: 'SUCCESS',
      statusCode: 200,
      details: { password: 'Temp1234' },
    });

    expect(result.userId).toBe(7);
    expect(result.userName).toBe('موظف');
    expect(result.entityId).toBe('2');
    expect(result.details.password).toBe('***MASKED***');
  });
});
