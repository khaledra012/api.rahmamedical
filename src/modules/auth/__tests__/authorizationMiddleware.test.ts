import { NextFunction, Request, Response } from 'express';
import { requirePermission } from '../../../shared/middlewares/authorizationMiddleware';
import { ForbiddenError } from '../../../shared/errors';

const buildRequest = (role: 'admin' | 'operator' | 'viewer', mustChangePassword = false) => ({
  user: { id: 1, name: 'Test', email: 'test@example.com', username: 'test', role, mustChangePassword },
}) as Request;

describe('authorizationMiddleware', () => {
  const response = {} as Response;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => { next = jest.fn(); });

  it('allows an operator to manage products', () => {
    requirePermission('products.manage')(buildRequest('operator'), response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks a viewer from changing products', () => {
    expect(() => requirePermission('products.manage')(buildRequest('viewer'), response, next)).toThrow(ForbiddenError);
  });

  it('reserves cancellation retries for admins', () => {
    expect(() => requirePermission('cancellations.retry')(buildRequest('operator'), response, next)).toThrow(ForbiddenError);
    requirePermission('cancellations.retry')(buildRequest('admin'), response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks mutations until the temporary password is changed', () => {
    expect(() => requirePermission('products.manage')(buildRequest('operator', true), response, next)).toThrow(ForbiddenError);
  });
});
