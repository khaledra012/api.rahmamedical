export const mockDaftraProductWebhook = {
  id: 1359,
  name: 'كمامة طبية 3 طبقات (علبة 50 حبة)',
  product_code: 'MED-MSK-01',
  barcode: '6281001070012',
  unit_price: 25.0,
  cost: 15.0,
  discount_price: 22.5,
  stock_balance: 150,
  storehouse_id: 1,
  description: 'كمامات طبية معتمدة عالية الكفاءة مع فلتر حماية ثلاثي',
  weight: 0.25,
  is_taxable: true,
  tax_percentage: 15.0,
  category_name: 'مستلزمات وقاية',
};

export const mockDaftraProductsListResponse = {
  status: 'success',
  data: [
    mockDaftraProductWebhook,
    {
      id: 1360,
      name: 'جوانتي فحص لاتكس معقم (مقاس M)',
      product_code: 'MED-GLV-02',
      barcode: '6281001070029',
      unit_price: 35.0,
      cost: 20.0,
      stock_balance: 80,
      storehouse_id: 1,
      description: 'قفازات طبية مطاطية خالية من البودرة',
      weight: 0.45,
      is_taxable: true,
      category_name: 'مستلزمات طبية',
    },
  ],
};

export const mockDaftraStorehousesResponse = {
  status: 'success',
  data: [
    { id: 1, name: 'المستودع الرئيسي - الرياض' },
    { id: 2, name: 'مستودع جدة المركزي' },
  ],
};
