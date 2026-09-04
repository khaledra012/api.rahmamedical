import axios from 'axios';
import { DaftraClient } from '../DaftraClient';
import {
  mockDaftraProductWebhook,
  mockDaftraProductsListResponse,
  mockDaftraStorehousesResponse,
} from '../__mocks__/daftraFixtures';
import { UnauthorizedError, NotFoundError } from '../../errors';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DaftraClient Unit Tests', () => {
  let daftraClient: DaftraClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      request: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    daftraClient = new DaftraClient('https://account.daftra.com/api2', 'test-key');
    jest.clearAllMocks();
  });

  it('should fetch single product by id from Daftra', async () => {
    mockAxiosInstance.request.mockResolvedValue({
      data: { status: 'success', data: mockDaftraProductWebhook },
    });

    const result = await daftraClient.getProduct(1359);

    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/products/1359.json',
    });
    expect(result.data.name).toBe(mockDaftraProductWebhook.name);
    expect(result.data.product_code).toBe('MED-MSK-01');
  });

  it('should throw NotFoundError when product is not found in Daftra (404)', async () => {
    mockAxiosInstance.request.mockRejectedValue({
      response: {
        status: 404,
        data: { message: 'Product not found' },
      },
    });

    await expect(daftraClient.getProduct(99999)).rejects.toThrow(NotFoundError);
  });

  it('should fetch list of storehouses from Daftra', async () => {
    mockAxiosInstance.request.mockResolvedValue({
      data: mockDaftraStorehousesResponse,
    });

    const result = await daftraClient.getStorehouses();

    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/storehouses.json',
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0].name).toBe('المستودع الرئيسي - الرياض');
  });
});
