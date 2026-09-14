/**
 * Helper to normalize phone numbers according to ZATCA (BT-57) requirements:
 * "The Buyer's contact phone number (BT-57) shall start with '0' or '+',
 * followed by a maximum of 15 numbers and minimum 4 characters after the '+' or '0', if exist."
 */

export function formatZatcaPhone(phone?: string | number | null): string | undefined {
  if (phone === undefined || phone === null) return undefined;

  let str = String(phone).trim();
  if (!str) return undefined;

  // 1. تحويل الأرقام المشرقية (٠-٩) إلى أرقام (0-9)
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

  // 2. إزالة أي مسافات، أقواس، شرطات، نقاط، أو سلاش
  str = str.replace(/[\s\-\(\)\.\/]/g, '');
  if (!str) return undefined;

  // 3. تحويل الصفرين الدوليين 00 في البداية إلى +
  if (str.startsWith('00')) {
    str = '+' + str.slice(2);
  }

  // 4. معالجة البداية لتطابق شرط هيئة الزكاة (تبدأ بـ 0 أو +)
  if (str.startsWith('+')) {
    // يبدأ بـ + بالفعل
  } else if (str.startsWith('0')) {
    // يبدأ بـ 0 بالفعل
  } else if (/^5\d{8}$/.test(str)) {
    // رقم سعودي محلي من 9 أرقام يبدأ بـ 5 (مثل 501234567) -> نحوله للصيغة الدولية +966501234567
    str = '+966' + str;
  } else if (
    /^966\d+$/.test(str) ||
    /^974\d+$/.test(str) ||
    /^971\d+$/.test(str) ||
    /^965\d+$/.test(str) ||
    /^968\d+$/.test(str) ||
    /^973\d+$/.test(str) ||
    /^20\d+$/.test(str)
  ) {
    // يبدأ بمفتاح دولة بدون + -> نضيف +
    str = '+' + str;
  } else {
    // أي رقم دولي يبدأ بأرقام عادية
    str = '+' + str;
  }

  // 5. التحقق من الطول وفق قاعدة BT-57:
  // "followed by a maximum of 15 numbers and minimum 4 characters after the '+' or '0'"
  const prefix = str[0]; // '+' أو '0'
  let digitsAfter = str.slice(1).replace(/\D/g, '');

  // إذا كانت الأرقام بعد البادئة أقل من 4، الرقم غير صالح للاستخدام مع الزكاة
  if (digitsAfter.length < 4) {
    return undefined;
  }

  // حد أقصى 15 رقماً بعد البادئة
  if (digitsAfter.length > 15) {
    digitsAfter = digitsAfter.slice(0, 15);
  }

  return prefix + digitsAfter;
}
