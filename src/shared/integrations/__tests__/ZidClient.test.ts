import axios from 'axios';
import { ZidClient } from '../ZidClient';
import {
  mockZidProductCreatedResponse,
  mockZidCategoriesResponse,
  mockZidDuplicateSkuError,
} from '../__mocks__/zidFixtures';
import { UnauthorizedError, ValidationError, NotFoundError, AppError } from '../../errors';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ZidClient Unit Tests', () => {
  let zidClient: ZidClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      request: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    zidClient = new ZidClient('https://api.zid.sa/v1', 'test-token', 'test-store');
    jest.clearAllMocks();
  });

  describe('createProduct()', () => {
    it('should successfully send product creation payload and return created product details', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: mockZidProductCreatedResponse });

      const payload = {
        name: { ar: 'كمامة طبية 3 طبقات', en: 'Medical Face Mask' },
        sku: 'MED-MSK-01',
        price: 25.0,
      };

      const result = await zidClient.createProduct(payload);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: '/products',
        data: payload,
      });
      expect(result.product.id).toBe(mockZidProductCreatedResponse.product.id);
      expect(result.product.sku).toBe('MED-MSK-01');
    });

    it('should throw ValidationError with details when Zid responds with 422 Unprocessable Entity (e.g. duplicate SKU)', async () => {
      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 422,
          data: mockZidDuplicateSkuError,
        },
      });

      const payload = {
        name: { ar: 'كمامة طبية 3 طبقات' },
        sku: 'DUPLICATE-SKU',
        price: 25.0,
      };

      await expect(zidClient.createProduct(payload)).rejects.toThrow(ValidationError);
    });

    it('should throw UnauthorizedError when token is invalid (401)', async () => {
      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 401,
          data: { message: 'Unauthenticated' },
        },
      });

      await expect(
        zidClient.createProduct({
          name: { ar: 'منتج' },
          sku: 'SKU-01',
          price: 10,
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('getCategories()', () => {
    it('should fetch store categories from Zid', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: mockZidCategoriesResponse });

      const result = await zidClient.getCategories();

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/managers/store/categories',
      });
      expect(result.categories).toHaveLength(4);
      expect(result.categories[0].name.ar).toBe('مستلزمات الوقاية والحماية');
    });
  });

  describe('updateProduct()', () => {
    it('should send PATCH request to update product in Zid', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { status: 'success', product: { id: 'zid-123', price: 30.0 } },
      });

      const result = await zidClient.updateProduct('zid-123', { price: 30.0 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'PATCH',
        url: '/products/zid-123',
        data: { price: 30.0 },
      });
      expect(result.product.price).toBe(30.0);
    });
  });
});
