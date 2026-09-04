import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../middlewares/errorHandler';
import { AppError, NotFoundError } from '../errors';

describe('errorHandler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  it('should handle AppError and return corresponding status code and message', () => {
    const error = new NotFoundError('Item not found', { id: 123 });

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Item not found',
        error: expect.objectContaining({
          statusCode: 404,
          details: { id: 123 },
        }),
      })
    );
  });

  it('should handle generic Error and return 500 status code', () => {
    const genericError = new Error('Database crash');

    errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Internal Server Error',
        error: expect.objectContaining({
          statusCode: 500,
        }),
      })
    );
  });

  it('should handle JWT TokenExpiredError as 401', () => {
    const jwtError = new Error('jwt expired');
    jwtError.name = 'TokenExpiredError';

    errorHandler(jwtError, mockReq as Request, mockRes as Response, mockNext as NextFunction);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Authentication token expired',
      })
    );
  });
});
