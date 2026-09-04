export interface IPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface IApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T | null;
  meta?: IPaginationMeta;
  error?: {
    statusCode: number;
    details?: any;
  };
}
