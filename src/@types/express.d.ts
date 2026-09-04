import { AuthenticatedUser } from '../modules/auth/dtos/auth.dtos';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      rawBody?: Buffer;
    }
  }
}

export {};
