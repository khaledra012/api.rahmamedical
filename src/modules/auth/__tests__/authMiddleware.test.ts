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

  it('should call next() and attach user to req when valid Bearer token is provided', () => {
    const mockUser = { id: 1, email: 'admin@daftra-sync.com', role: 'admin' };
    jest.spyOn(authService, 'verifyToken').mockReturnValue(mockUser);

    mockReq.headers = {
      authorization: 'Bearer valid_jwt_token_123',
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(authService.verifyToken).toHaveBeenCalledWith('valid_jwt_token_123');
    expect(mockReq.user).toEqual(mockUser);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should throw UnauthorizedError when Authorization header is missing', () => {
    mockReq.headers = {};

    expect(() => {
      authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    }).toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError when Authorization header does not start with Bearer', () => {
    mockReq.headers = {
      authorization: 'Basic dXNlcjpwYXNz',
    };

    expect(() => {
      authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    }).toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError when token is malformed or invalid', () => {
    jest.spyOn(authService, 'verifyToken').mockImplementation(() => {
      throw new UnauthorizedError('رمز التحقق غير صالح أو تالف');
    });

    mockReq.headers = {
      authorization: 'Bearer invalid_token',
    };

    expect(() => {
      authMiddleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    }).toThrow(UnauthorizedError);
  });
});
