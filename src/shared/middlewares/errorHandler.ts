import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { env } from '../../config/env';
import { logger } from '../helpers/logger';
import { IApiResponse } from '../interfaces';

export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details || null;
  } else if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    message = 'Database Validation Error';
    details = err.errors ? err.errors.map((e: any) => ({ field: e.path, message: e.message })) : err.message;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired';
  } else {
    // Log unexpected errors
    logger.error(`Unexpected Error: ${err.message}`, { stack: err.stack });
  }

  const responsePayload: IApiResponse = {
    success: false,
    message,
    data: null,
    error: {
      statusCode,
      details,
      ...(env.nodeEnv === 'development' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(responsePayload);
};
