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
  const raw = String(countryNameOrId).trim();
  const lower = raw.toLowerCase();

  // السعودية
  if (raw === '184' || lower.includes('سعود') || lower === 'sa' || lower === 'ksa') return 'SA';

  // دول الخليج والدول العربية
  if (raw === '17' || lower.includes('بحرين') || lower === 'bh' || lower.includes('bahrain')) return 'BH';
  if (lower.includes('امارات') || lower.includes('إمارات') || lower === 'ae' || lower.includes('uae')) return 'AE';
  if (lower.includes('كويت') || lower === 'kw' || lower.includes('kuwait')) return 'KW';
  if (lower.includes('عمان') || lower.includes('عُمان') || lower === 'om' || lower.includes('oman')) return 'OM';
  if (lower.includes('قطر') || lower === 'qa' || lower.includes('qatar')) return 'QA';
  if (lower.includes('مصر') || lower === 'eg' || lower.includes('egypt')) return 'EG';
  if (lower.includes('أردن') || lower.includes('اردن') || lower === 'jo' || lower.includes('jordan')) return 'JO';

  // إذا كان كود ISO من حرفين إنجليزيين
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const upper = raw.toUpperCase();
    return upper === 'SA' ? 'SA' : upper;
  }

  return 'SA';
}

/**
 * فحص ما إذا كان الطلب دولياً (تصدير خارج المملكة)
 */
export function isInternationalCountry(countryCode?: string | null): boolean {
  if (!countryCode) return false;
  const clean = countryCode.trim().toUpperCase();
  return clean !== 'SA' && clean !== 'KSA';
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
