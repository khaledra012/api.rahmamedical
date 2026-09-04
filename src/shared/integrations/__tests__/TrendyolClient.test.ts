import axios from 'axios';
import { TrendyolClient } from '../TrendyolClient';
import {
  mockTrendyolBatchResponse,
  mockTrendyolBatchStatusCompleted,
  mockTrendyolBrandResponse,
} from '../__mocks__/trendyolFixtures';
import { UnauthorizedError, ValidationError, NotFoundError } from '../../errors';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TrendyolClient Unit Tests', () => {
  let trendyolClient: TrendyolClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      request: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    trendyolClient = new TrendyolClient('https://api.trendyol.com/sapigw', '12345', 'key', 'secret');
    jest.clearAllMocks();
  });

  describe('createProducts()', () => {
    it('should successfully send product creation payload to Trendyol and return batchRequestId', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: mockTrendyolBatchResponse });

      const items = [
        {
          barcode: '6281001070012',
          title: 'كمامة طبية 3 طبقات',
          productMainId: 'MED-MSK-01',
          brandId: 1001,
          categoryId: 501,
          quantity: 150,
          stockCode: 'MED-MSK-01',
          dimensionalWeight: 1,
          description: 'كمامة طبية معتمدة',
          listPrice: 25.0,
          salePrice: 22.5,
          vatRate: 15,
          images: [{ url: 'https://cdn.example.com/mask.jpg' }],
        },
      ];

      const result = await trendyolClient.createProducts(items);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: '/suppliers/12345/v2/products',
        data: { items },
      });
      expect(result.batchRequestId).toBe(mockTrendyolBatchResponse.batchRequestId);
    });

    it('should throw UnauthorizedError when credentials are invalid (401)', async () => {
      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      });

      await expect(trendyolClient.createProducts([])).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ValidationError when Trendyol rejects product payload (400)', async () => {
      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Invalid categoryId', errors: [{ message: 'Category not found' }] },
        },
      });

      await expect(trendyolClient.createProducts([])).rejects.toThrow(ValidationError);
    });
  });

  describe('updatePriceAndInventory()', () => {
    it('should update price and inventory in Trendyol', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: { batchRequestId: 'batch-update-123' } });

      const items = [
        {
          barcode: '6281001070012',
          quantity: 200,
          salePrice: 20.0,
          listPrice: 25.0,
        },
      ];

      const result = await trendyolClient.updatePriceAndInventory(items);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: '/suppliers/12345/products/price-and-inventory',
        data: { items },
      });
      expect(result.batchRequestId).toBe('batch-update-123');
    });
  });
});
