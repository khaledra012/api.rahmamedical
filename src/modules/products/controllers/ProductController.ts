import { Request, Response } from 'express';
import { productService } from '../services/ProductService';
import { productPollerService } from '../services/ProductPollerService';
import { zidClient } from '../../../shared/integrations/ZidClient';
import { trendyolClient } from '../../../shared/integrations/TrendyolClient';
import { sendSuccess } from '../../../shared/helpers/responseFormatter';

export class ProductController {
  /**
   * GET /api/products/stats
   */
  public getStats = async (req: Request, res: Response): Promise<Response> => {
    const stats = await productService.getDashboardStats();
    return sendSuccess(res, stats, 'تم جلب إحصائيات لوحة التحكم بنجاح', 200);
  };

  /**
   * GET /api/products
   */
  public getProducts = async (req: Request, res: Response): Promise<Response> => {
    const { status, search, page, limit } = req.query;
    const result = await productService.getProducts({
      status: status as any,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    const currentPage = result.page;
    const totalPages = result.totalPages;

    return sendSuccess(
      res,
      result.products,
      'تم جلب قائمة المنتجات بنجاح',
      200,
      {
        total: result.total,
        page: currentPage,
        limit: result.limit,
        totalPages: totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      }
    );
  };

  /**
   * GET /api/products/:id
   */
  public getProductById = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const result = await productService.getProductById(productId);
    return sendSuccess(res, result, 'تم جلب تفاصيل المنتج بنجاح', 200);
  };

  /**
   * PATCH /api/products/:id/enrich
   */
  public enrichProduct = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const product = await productService.enrichProduct(productId, req.body);
    return sendSuccess(res, product, 'تم حفظ البيانات التسويقية للمنتج بنجاح', 200);
  };

  /**
   * POST /api/products/:id/publish (Zid)
   */
  public publishToZid = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const result = await productService.publishToZid(productId);
    return sendSuccess(res, result, 'تم اعتماد ونشر المنتج إلى متجر زد بنجاح', 200);
  };

  /**
   * POST /api/products/:id/publish-trendyol (Trendyol)
   */
  public publishToTrendyol = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const result = await productService.publishToTrendyol(productId);
    return sendSuccess(res, result, 'تم اعتماد ونشر المنتج إلى متجر ترينديول بنجاح', 200);
  };

  /**
   * POST /api/products/:id/publish-all (All Stores)
   */
  public publishToAll = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const result = await productService.publishToAllStores(productId);
    return sendSuccess(res, result, 'تم اعتماد ونشر المنتج إلى جميع المتاجر (زد + ترينديول) بنجاح', 200);
  };

  /**
   * POST /api/products/:id/retry
   */
  public retryPublish = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const result = await productService.retryPublish(productId);
    return sendSuccess(res, result, 'تمت إعادة محاولة نشر المنتج بنجاح', 200);
  };

  /**
   * PATCH /api/products/:id/pause
   */
  public togglePause = async (req: Request, res: Response): Promise<Response> => {
    const productId = parseInt(String(req.params.id));
    const product = await productService.togglePauseProduct(productId);
    const msg =
      product.publishStatus === 'PAUSED'
        ? 'تم إيقاف عرض المنتج في المتجر مؤقتاً'
        : 'تمت إعادة تفعيل عرض المنتج في المتجر';
    return sendSuccess(res, product, msg, 200);
  };

  /**
   * GET /api/products/zid-categories
   */
  public getZidCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await zidClient.getCategories();
      return sendSuccess(res, result?.categories || [], 'تم جلب تصنيفات متجر زد بنجاح', 200);
    } catch (error: any) {
      return sendSuccess(res, [], 'تعذر جلب التصنيفات الحية', 200);
    }
  };

  /**
   * GET /api/products/trendyol-brands
   */
  public getTrendyolBrands = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await trendyolClient.getBrands();
      return sendSuccess(res, result?.brands || [], 'تم جلب ماركات ترينديول بنجاح', 200);
    } catch (error: any) {
      return sendSuccess(res, [], 'تعذر جلب الماركات الحية', 200);
    }
  };

  /**
   * POST /api/products/sync-daftra
   */
  public syncFromDaftra = async (req: Request, res: Response): Promise<Response> => {
    const forceFull = req.query.full === 'true' || req.body?.fullSync === true;
    const lookbackMinutes = req.query.lookback ? parseInt(String(req.query.lookback)) : 120;
    const result = await productPollerService.pollProductsNow(forceFull, lookbackMinutes);
    return sendSuccess(
      res,
      result,
      `تمت المزامنة مع دفترة بنجاح (تمت معالجة ${result.processedCount} منتج)`,
      200
    );
  };

  /**
   * POST /api/products/auto-link
   */
  public autoLinkPending = async (req: Request, res: Response): Promise<Response> => {
    const result = await productService.autoLinkPendingProducts();
    return sendSuccess(
      res,
      result,
      `تم فحص ${result.totalChecked} منتج، تم ربط ${result.linkedCount} منتج بنجاح بمتجر زد`,
      200
    );
  };
}

export const productController = new ProductController();
