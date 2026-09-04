import { Request, Response, NextFunction } from 'express';
import { validateRequest } from '../middlewares/validateRequest';
import * as expressValidator from 'express-validator';
import { ValidationError } from '../errors';

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

describe('validateRequest Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should call next() if there are no validation errors', () => {
    (expressValidator.validationResult as unknown as jest.Mock).mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });

    validateRequest(mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should throw ValidationError if validation errors exist', () => {
    (expressValidator.validationResult as unknown as jest.Mock).mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'email', msg: 'Invalid email address', value: 'not-an-email' },
      ],
    });

    expect(() => {
      validateRequest(mockReq as Request, mockRes as Response, mockNext as NextFunction);
    }).toThrow(ValidationError);
  });
});
