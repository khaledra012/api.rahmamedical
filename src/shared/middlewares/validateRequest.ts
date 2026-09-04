import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ValidationError } from '../errors';

export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: any) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));
    throw new ValidationError('Input validation failed', formattedErrors);
  }
  next();
};
