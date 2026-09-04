export const mockTrendyolBatchResponse = {
  batchRequestId: 'b78a9c2e-44d1-4e89-a281-9876543210ab',
  status: 'PROCESSING',
  itemCount: 1,
};

export const mockTrendyolBatchStatusCompleted = {
  batchRequestId: 'b78a9c2e-44d1-4e89-a281-9876543210ab',
  status: 'COMPLETED',
  items: [
    {
      barcode: '6281001070012',
      status: 'SUCCESS',
      failureReasons: [],
    },
  ],
};

export const mockTrendyolBrandResponse = {
  brands: [
    { id: 1001, name: 'Rahma Medical' },
    { id: 1002, name: 'Generic Medical' },
  ],
};
