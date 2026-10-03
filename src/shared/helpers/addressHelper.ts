export interface ExtractedAddress {
  countryName: string;
  countryCode: string;
  city: string;
  district: string;
  street: string;
  streetAddress: string;
  fullAddress: string;
  isInternational: boolean;
}

// جدول شامل للأكواد الدولية للدول العربية وأبرز دول العالم
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  // دول مجلس التعاون الخليجي
  'sa': 'SA', 'ksa': 'SA', 'السعودية': 'SA', 'المملكة العربية السعودية': 'SA', 'saudi arabia': 'SA',
  'ae': 'AE', 'uae': 'AE', 'الإمارات': 'AE', 'الامارات': 'AE', 'الإمارات العربية المتحدة': 'AE', 'united arab emirates': 'AE', 'دبي': 'AE', 'أبوظبي': 'AE',
  'kw': 'KW', 'الكويت': 'KW', 'kuwait': 'KW',
  'qa': 'QA', 'قطر': 'QA', 'qatar': 'QA',
  'bh': 'BH', 'البحرين': 'BH', 'bahrain': 'BH',
  'om': 'OM', 'عمان': 'OM', 'عُمان': 'OM', 'سلطنة عمان': 'OM', 'oman': 'OM',

  // الدول العربية
  'eg': 'EG', 'مصر': 'EG', 'جمهورية مصر العربية': 'EG', 'egypt': 'EG',
  'jo': 'JO', 'الأردن': 'JO', 'الاردن': 'JO', 'المملكة الأردنية الهاشمية': 'JO', 'jordan': 'JO',
  'iq': 'IQ', 'العراق': 'IQ', 'iraq': 'IQ',
  'ye': 'YE', 'اليمن': 'YE', 'yemen': 'YE',
  'lb': 'LB', 'لبنان': 'LB', 'lebanon': 'LB',
  'sy': 'SY', 'سوريا': 'SY', 'syria': 'SY',
  'ps': 'PS', 'فلسطين': 'PS', 'palestine': 'PS',
  'sd': 'SD', 'السودان': 'SD', 'sudan': 'SD',
  'ly': 'LY', 'ليبيا': 'LY', 'libya': 'LY',
  'tn': 'TN', 'تونس': 'TN', 'tunisia': 'TN',
  'dz': 'DZ', 'الجزائر': 'DZ', 'algeria': 'DZ',
  'ma': 'MA', 'المغرب': 'MA', 'morocco': 'MA',
  'mr': 'MR', 'موريتانيا': 'MR', 'mauritania': 'MR',
  'so': 'SO', 'الصومال': 'SO', 'somalia': 'SO',
  'dj': 'DJ', 'جيبوتي': 'DJ', 'djibouti': 'DJ',

  // دول عالمية شائعة
  'tr': 'TR', 'تركيا': 'TR', 'turkey': 'TR', 'türkiye': 'TR',
  'us': 'US', 'usa': 'US', 'أمريكا': 'US', 'امريكا': 'US', 'الولايات المتحدة': 'US', 'united states': 'US',
  'gb': 'GB', 'uk': 'GB', 'بريطانيا': 'GB', 'المملكة المتحدة': 'GB', 'united kingdom': 'GB', 'england': 'GB',
  'ca': 'CA', 'كندا': 'CA', 'canada': 'CA',
  'de': 'DE', 'ألمانيا': 'DE', 'المانيا': 'DE', 'germany': 'DE', 'deutschland': 'DE',
  'fr': 'FR', 'فرنسا': 'FR', 'france': 'FR',
  'it': 'IT', 'إيطاليا': 'IT', 'ايطاليا': 'IT', 'italy': 'IT',
  'es': 'ES', 'إسبانيا': 'ES', 'اسبانيا': 'ES', 'spain': 'ES',
  'nl': 'NL', 'هولندا': 'NL', 'netherlands': 'NL',
  'ch': 'CH', 'سويسرا': 'CH', 'switzerland': 'CH',
  'se': 'SE', 'السويد': 'SE', 'sweden': 'SE',
  'no': 'NO', 'النرويج': 'NO', 'norway': 'NO',
  'ru': 'RU', 'روسيا': 'RU', 'russia': 'RU',
  'cn': 'CN', 'الصين': 'CN', 'china': 'CN',
  'in': 'IN', 'الهند': 'IN', 'india': 'IN',
  'pk': 'PK', 'باكستان': 'PK', 'pakistan': 'PK',
  'my': 'MY', 'ماليزيا': 'MY', 'malaysia': 'MY',
  'id': 'ID', 'إندونيسيا': 'ID', 'اندونيسيا': 'ID', 'indonesia': 'ID',
  'ph': 'PH', 'الفلبين': 'PH', 'philippines': 'PH',
  'au': 'AU', 'أستراليا': 'AU', 'استراليا': 'AU', 'australia': 'AU',
  'nz': 'NZ', 'نيوزيلندا': 'NZ', 'new zealand': 'NZ',
};

/**
 * استخراج الكود الدولي للدولة (2-letter ISO)
 */
export function resolveCountryCode(
  countryInput?: string | number | null,
  directIsoCode?: string | null
): string {
  // 1. إذا كان الكود الدولي المباشر مرسلاً من المنصة ككود ISO من حرفين (مثل Zid country.code أو Trendyol countryCode)
  if (directIsoCode && /^[A-Za-z]{2}$/.test(String(directIsoCode).trim())) {
    const direct = String(directIsoCode).trim().toUpperCase();
    if (direct !== 'NA' && direct !== 'NU' && direct !== 'NO') {
      return direct;
    }
  }

  if (!countryInput) return 'SA';
  const raw = String(countryInput).trim();
  const lower = raw.toLowerCase();

  // فحص الكلمات غير الصالحة أو الوهمية
  if (lower === 'na' || lower === 'null' || lower === 'none' || lower === 'undefined') {
    return 'SA';
  }

  // 2. إذا كان المدخل نفسه كود ISO من حرفين
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const upper = raw.toUpperCase();
    if (upper !== 'NA' && upper !== 'NU' && upper !== 'NO') {
      return upper;
    }
  }

  // 3. فحص معرفات المنصات الخاصة بالسعودية (معرف زد 64 أو 184)
  if (raw === '64' || raw === '184') {
    return 'SA';
  }

  // 4. مطابقة تامة في جدول الدول
  if (COUNTRY_NAME_TO_ISO[lower]) {
    return COUNTRY_NAME_TO_ISO[lower];
  }

  // 5. فحص بالكلمات المفتاحية الجزئية في جدول الدول
  for (const [key, code] of Object.entries(COUNTRY_NAME_TO_ISO)) {
    if (key.length > 2 && lower.includes(key)) {
      return code;
    }
  }

  // 6. فحص صريح لمؤشرات السعودية
  if (lower.includes('سعود') || lower.includes('saudi') || lower.includes('ksa')) {
    return 'SA';
  }

  // 7. إذا كان هناك اسم دولة محدد بالكامل ولكن غير مدرج في القائمة:
  // طالما ليس فارغاً وليس السعودية فهو تصدير دولي قطعي خارج المملكة
  // نرجع كود 'XX' (المعيار الدولي لهيئة الزكاة والأيزو للمناطق والدول الدولية العامة) لضمان معاملتها كتصدير 0%
  return 'XX';
}

/**
 * فحص ما إذا كان الطلب دولياً (تصدير خارج المملكة)
 * القاعدة الذهبية: أي طلب ليس إلى السعودية SA هو تصدير دولي معفي بموجب المادة 32
 */
export function isInternationalCountry(countryCode?: string | null): boolean {
  if (!countryCode) return false;
  const clean = countryCode.trim().toUpperCase();
  if (clean === 'NA' || clean === 'NULL' || clean === 'NONE' || clean === 'UNDEFINED') return false;
  return clean !== 'SA' && clean !== 'KSA';
}

export function extractAddressDetails(shipping: any, shippingAddress: any): ExtractedAddress {
  const addr = shipping?.address || shippingAddress || {};

  // استخراج الكود الدولي المباشر من واجهة المتجر إن وُجد (زد ترسل country.code وترينديول ترسل countryCode)
  const directCode =
    addr.country?.code ||
    addr.country_code ||
    shipping?.country_code ||
    shippingAddress?.country_code ||
    shippingAddress?.countryCode ||
    null;

  const rawCountry =
    addr.country?.name ||
    (typeof addr.country === 'string' ? addr.country : null) ||
    shipping?.country ||
    (typeof shippingAddress === 'string' ? shippingAddress : null) ||
    'السعودية';

  const rawCountryId = addr.country?.id || shipping?.country_id;

  const countryCode = resolveCountryCode(directCode || rawCountryId || rawCountry, directCode);
  const countryName =
    addr.country?.name ||
    (typeof addr.country === 'string' ? addr.country : null) ||
    shipping?.country ||
    (countryCode === 'SA' ? 'السعودية' : countryCode);

  const rawCity = addr.city?.name || addr.city || shipping?.city || '';
  const city = typeof rawCity === 'string' ? rawCity.trim() : '';

  const district = (addr.district || shipping?.district || '').trim();
  const street = (addr.street || addr.formatted_address || shipping?.street || '').trim();

  // عنوان الشارع والحي فقط (بدون تكرار الدولة والمدينة لأن دفترة يعرضهما في حقول منفصلة)
  const streetParts = [district, street].filter(Boolean);
  const streetAddress = streetParts.join(' - ') || street || district || '';

  const parts = [countryName, city, district, street].filter(Boolean);
  const fullAddress = parts.join(' - ');

  const isInternational = isInternationalCountry(countryCode);

  return {
    countryName: typeof countryName === 'string' ? countryName : 'السعودية',
    countryCode,
    city,
    district,
    street,
    streetAddress,
    fullAddress: fullAddress || 'السعودية',
    isInternational,
  };
}
