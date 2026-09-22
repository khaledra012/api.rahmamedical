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

  it('should fetch a source invoice with its line items', async () => {
    mockAxiosInstance.request.mockResolvedValue({
      data: { data: { Invoice: { id: 44, client_id: 3, InvoiceItem: [{ product_id: 1 }] } } },
    });

    const result = await daftraClient.getInvoice(44);

    expect(result.data.Invoice.id).toBe(44);
    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/invoices/44.json',
    });
  });

  it('should find an existing refund receipt linked to an invoice', async () => {
    mockAxiosInstance.request.mockResolvedValue({
      data: {
        data: [
          { RefundReceipt: { id: 91, no: 'RR-91', subscription_id: 44, notes: 'ZID-CANCEL-ZID-123' } },
        ],
      },
    });

    const result = await daftraClient.findRefundReceiptByInvoice(44, 'ZID-123');

    expect(result.id).toBe(91);
    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/refund_receipts.json',
      params: { source_id: 44, limit: 100 },
    });
  });

  it('should fall back to recent refund receipts when Daftra source filtering returns no rows', async () => {
    mockAxiosInstance.request
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({
        data: {
          data: [
            { RefundReceipt: { id: 92, no: 'RR-92', subscription_id: 44, notes: 'ZID-CANCEL-ZID-123' } },
          ],
        },
      });

    const result = await daftraClient.findRefundReceiptByInvoice(44, 'ZID-123');

    expect(result.id).toBe(92);
    expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      url: '/refund_receipts.json',
      params: { limit: 100 },
    });
  });

  it('should create a refund receipt without adding payment data', async () => {
    mockAxiosInstance.request.mockResolvedValue({
      data: { result: 'successful', code: 202, id: 91, invoice_number: 'RR-91' },
    });
    const payload = {
      Invoice: { subscription_id: 44, date: '2026-09-23' },
      InvoiceItem: [{ product_id: 1, unit_price: 100, quantity: 1 }],
    };

    const result = await daftraClient.createRefundReceipt(payload);

    expect(result.id).toBe(91);
    expect(mockAxiosInstance.request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/refund_receipts.json',
      data: payload,
    });
  });
});
