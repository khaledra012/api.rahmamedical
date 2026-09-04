import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(message: string = 'Requested resource was not found', details?: any) {
    super(message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access', details?: any) {
    super(message, 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden: Access denied', details?: any) {
    super(message, 403, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict or duplicate entry', details?: any) {
    super(message, 409, details);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: any) {
    super(message, 400, details);
  }
}
