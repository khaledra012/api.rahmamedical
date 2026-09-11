export interface ExtractedAddress {
  countryName: string;
  countryCode: string;
  city: string;
  district: string;
  street: string;
  streetAddress: string;
  fullAddress: string;
}

export function resolveCountryCode(countryNameOrId?: string | number | null): string {
  if (!countryNameOrId) return 'SA';
  const str = String(countryNameOrId).trim().toLowerCase();
  if (str === '184' || str.includes('سعود') || str.includes('sa') || str.includes('ksa')) return 'SA';
  if (str === '17' || str.includes('بحرين') || str.includes('bh') || str.includes('bahrain')) return 'BH';
  if (str.includes('امارات') || str.includes('إمارات') || str.includes('ae') || str.includes('uae')) return 'AE';
  if (str.includes('كويت') || str.includes('kw') || str.includes('kuwait')) return 'KW';
  if (str.includes('عمان') || str.includes('عُمان') || str.includes('om') || str.includes('oman')) return 'OM';
  if (str.includes('قطر') || str.includes('qa') || str.includes('qatar')) return 'QA';
  if (str.includes('مصر') || str.includes('eg') || str.includes('egypt')) return 'EG';
  return 'SA';
}

export function extractAddressDetails(shipping: any, shippingAddress: any): ExtractedAddress {
  const addr = shipping?.address || shippingAddress || {};

  const rawCountry = addr.country?.name || addr.country || shipping?.country || 'السعودية';
  const rawCountryId = addr.country?.id;
  const countryCode = resolveCountryCode(rawCountryId || rawCountry);
  const countryName = typeof rawCountry === 'string' ? rawCountry : 'السعودية';

  const rawCity = addr.city?.name || addr.city || shipping?.city || '';
  const city = typeof rawCity === 'string' ? rawCity.trim() : '';

  const district = (addr.district || shipping?.district || '').trim();
  const street = (addr.street || addr.formatted_address || shipping?.street || '').trim();

  // عنوان الشارع والحي فقط (بدون تكرار الدولة والمدينة لأن دفترة يعرضهما في حقول منفصلة)
  const streetParts = [district, street].filter(Boolean);
  const streetAddress = streetParts.join(' - ') || street || district || '';

  const parts = [countryName, city, district, street].filter(Boolean);
  const fullAddress = parts.join(' - ');

  return {
    countryName,
    countryCode,
    city,
    district,
    street,
    streetAddress,
    fullAddress: fullAddress || 'السعودية',
  };
}
