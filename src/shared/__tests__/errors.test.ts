import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../errors';

describe('Custom Errors Hierarchy', () => {
  it('AppError should set properties correctly', () => {
    const error = new AppError('Something went wrong', 500, { info: 'detail' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual({ info: 'detail' });
  });

  it('NotFoundError should have 404 status code', () => {
    const error = new NotFoundError('Product not found');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Product not found');
  });

  it('ValidationError should have 400 status code and details', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const error = new ValidationError('Validation failed', details);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
  });

  it('UnauthorizedError should have 401 status code', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('ForbiddenError should have 403 status code', () => {
    const error = new ForbiddenError('Access forbidden');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
  });

  it('ConflictError should have 409 status code', () => {
    const error = new ConflictError('Duplicate order reference');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(409);
  });

  it('BadRequestError should have 400 status code', () => {
    const error = new BadRequestError('Bad input');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
  });
});
