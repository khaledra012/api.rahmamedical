import { Response } from 'express';
import { sendSuccess, sendCreated } from '../helpers/responseFormatter';
import { IPaginationMeta } from '../interfaces';

describe('Response Formatter Helpers', () => {
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
  });

  it('sendSuccess should format standard success response with 200 default', () => {
    const data = { id: 1, name: 'Test Product' };
    sendSuccess(mockResponse as Response, data, 'Item fetched');

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      message: 'Item fetched',
      data,
    });
  });

  it('sendSuccess should include pagination metadata when provided', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const meta: IPaginationMeta = {
      page: 1,
      limit: 10,
      total: 50,
      totalPages: 5,
      hasNextPage: true,
      hasPrevPage: false,
    };

    sendSuccess(mockResponse as Response, data, 'List fetched', 200, meta);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      message: 'List fetched',
      data,
      meta,
    });
  });

  it('sendCreated should return 201 status code', () => {
    const data = { id: 101, code: 'NEW-01' };
    sendCreated(mockResponse as Response, data, 'Product created');

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith({
      success: true,
      message: 'Product created',
      data,
    });
  });
});
