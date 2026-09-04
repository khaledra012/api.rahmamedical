export const mockZidProductCreatedResponse = {
  status: 'success',
  product: {
    id: '96b0da2b6-f6f3-4493-9c88-18e47d25a812',
    name: {
      ar: 'كمامة طبية 3 طبقات (علبة 50 حبة)',
      en: 'Medical Face Mask 3-Ply (Box of 50)',
    },
    sku: 'MED-MSK-01',
    barcode: '6281001070012',
    price: 25.0,
    sale_price: 22.5,
    cost: 15.0,
    weight: 0.25,
    is_taxable: true,
    description: {
      ar: 'كمامات طبية معتمدة عالية الكفاءة مع فلتر حماية ثلاثي',
      en: 'Certified 3-ply high efficiency medical face masks',
    },
    categories: [101],
    images: [{ image: 'https://cdn.zid.store/sample-mask.jpg' }],
    stocks: [
      {
        location_id: 'default-zid-location-01',
        quantity: 150,
      },
    ],
    status: 'active',
  },
};

export const mockZidCategoriesResponse = {
  status: 'success',
  categories: [
    { id: 101, name: { ar: 'مستلزمات الوقاية والحماية', en: 'PPE & Protection' } },
    { id: 102, name: { ar: 'أجهزة قياس وفحص طبي', en: 'Diagnostic Equipment' } },
    { id: 103, name: { ar: 'شاش وضمادات جراحية', en: 'Dressings & Bandages' } },
    { id: 104, name: { ar: 'أدوات ومستهلكات طبية', en: 'Medical Consumables' } },
  ],
};

export const mockZidDuplicateSkuError = {
  status: 'error',
  code: 'DUPLICATE_SKU',
  message: 'The SKU MED-MSK-01 is already registered with another product.',
  errors: {
    sku: ['The sku has already been taken.'],
  },
};
