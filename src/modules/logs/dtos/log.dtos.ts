export interface LogQueryFilters {
  page?: number;
  limit?: number;
  entityType?: 'PRODUCT' | 'ORDER' | 'INVENTORY';
  status?: 'SUCCESS' | 'FAILED' | 'PENDING' | 'RETRYING';
  direction?: 'DAFTRA_TO_ZID' | 'ZID_TO_DAFTRA' | 'TRENDYOL_TO_DAFTRA' | 'DAFTRA_TO_TRENDYOL';
  source?: 'WEBHOOK' | 'MANUAL' | 'RETRY_ENGINE' | 'POLLER';
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface LogStatsResponse {
  totalLogs: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  retryingCount: number;
  successRate: number;
}
