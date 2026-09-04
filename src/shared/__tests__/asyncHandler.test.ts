import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';

describe('asyncHandler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = jest.fn();
  });

  it('should call next with error if async function throws', async () => {
    const error = new Error('Async execution failed');
    const asyncFn = jest.fn().mockRejectedValue(error);

    const handler = asyncHandler(asyncFn);
    handler(mockReq as Request, mockRes as Response, mockNext as NextFunction);

    // Wait for promise tick
    await Promise.resolve();

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should execute successfully without calling next with error when resolved', async () => {
    const asyncFn = jest.fn().mockResolvedValue('success');

    const handler = asyncHandler(asyncFn);
    handler(mockReq as Request, mockRes as Response, mockNext as NextFunction);

    await Promise.resolve();

    expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
