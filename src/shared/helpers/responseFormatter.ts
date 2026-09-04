import { Response } from 'express';
import { IApiResponse, IPaginationMeta } from '../interfaces';

export const sendSuccess = <T>(
  res: Response,
  data: T | null = null,
  message: string = 'Operation successful',
  statusCode: number = 200,
  meta?: IPaginationMeta
): Response => {
  const responsePayload: IApiResponse<T> = {
    success: true,
    message,
    data,
    ...(meta && { meta }),
  };

  return res.status(statusCode).json(responsePayload);
};

export const sendCreated = <T>(
  res: Response,
  data: T,
  message: string = 'Resource created successfully'
): Response => {
  return sendSuccess(res, data, message, 201);
};
