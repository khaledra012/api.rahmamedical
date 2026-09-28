import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../../shared/middlewares/authMiddleware';
import { authService } from '../services/AuthService';
import { UnauthorizedError } from '../../../shared/errors';

describe('authMiddleware Unit Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should call next() and attach the current database user when valid Bearer token is provided', async () => {
    const tokenUser = { id: 1, email: 'old@daftra-sync.com', username: 'admin', role: 'admin' as const, mustChangePassword: false };
    const currentUser = { id: 1, name: 'مدير النظام', email: 'admin@daftra-sync.com', username: 'admin', role: 'admin' as const, mustChangePassword: false, isActive: true };
    jest.spyOn(authService, 'verifyToken').mockReturnValue(tokenUser);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(currentUser as any);

    mockReq.headers = {
      authorization: 'Bearer valid_jwt_token_123',
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(authService.verifyToken).toHaveBeenCalledWith('valid_jwt_token_123');
    expect(authService.getCurrentUser).toHaveBeenCalledWith(1);
    expect(mockReq.user).toEqual(expect.objectContaining({ email: 'admin@daftra-sync.com', role: 'admin' }));
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should pass UnauthorizedError to next when Authorization header is missing', async () => {
    mockReq.headers = {};

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    expect(mockNext.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('should pass UnauthorizedError to next when Authorization header does not start with Bearer', async () => {
    mockReq.headers = {
      authorization: 'Basic dXNlcjpwYXNz',
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    expect(mockNext.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('should pass UnauthorizedError to next when token is malformed or invalid', async () => {
    jest.spyOn(authService, 'verifyToken').mockImplementation(() => {
      throw new UnauthorizedError('رمز التحقق غير صالح أو تالف');
    });

    mockReq.headers = {
      authorization: 'Bearer invalid_token',
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    expect(mockNext.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});
