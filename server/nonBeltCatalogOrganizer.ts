export interface NonBeltOrganizationResult {
  beforeNonBeltFamilies: number;
  afterNonBeltFamilies: number;
  mergedFamiliesCount: number;
  reassignedCategoryCount: number;
  cleanedNameCount: number;
  preservedSkuCount: number;
  aliasesAdded: number;
  byCategory: Record<string, { before: number; after: number; skus: number }>;
}

export interface DirectSkuAbsorptionResult {
  beforeDirectSkus: number;
  afterDirectSkus: number;
  absorbedIntoExistingFamily: number;
  createdNewFamilies: number;
  reassignedDirectCategoryCount: number;
  aliasesAdded: number;
}

const CATEGORY_TITLES: Record<string, string> = {
  'excel-v2-1-1': 'تسمه تایمینگ صنعتی',
  'excel-v2-1-2': 'تسمه وی‌بلت (V-Belt)',
  'excel-v2-1-3': 'تسمه تخت و انتقال قدرت',
  'excel-v2-1-4': 'تسمه گرد و پلی‌کورد',
  'excel-v2-1-5': 'تسمه خاص و روکش‌دار',
  'excel-v2-2-1': 'نوار نقاله صنعتی',
  'excel-v2-3-1': 'روکش رولر و غلتک',
  'excel-v2-3-2': 'قطعات رولر',
  'excel-v2-3-3': 'متعلقات نگهدارنده',
  'excel-v2-4-1': 'انواع پولی تایمینگ',
  'excel-v2-4-2': 'کوپلینگ انتقال قدرت',
  'excel-v2-5-1': 'برس سیمی',
  'excel-v2-5-2': 'برس خشک‌کن',
  'excel-v2-6-1': 'انواع ریل راهنما',
  'excel-v2-6-2': 'انواع گاید راهنما',
  'excel-v2-6-3': 'پروفیل و پایه هدایت',
  'excel-v2-6-4': 'سنسور و نگهدارنده‌ها',
  'excel-v2-7-1': 'قطعات لاستیکی صنعتی',
  'excel-v2-7-2': 'آب‌بندها و اورینگ',
  'excel-v2-7-3': 'ضربه‌گیر و مکنده',
  'excel-v2-7-4': 'قطعات تفلونی و پلیمری مهندسی',
  'excel-v2-7-5': 'شیلنگ، لوله خرطومی و اتصالات',
  'excel-v2-8-1': 'نوار برزنتی نسوز (چند لایه)',
  'excel-v2-8-2': 'نخ و عایق نسوز',
  'excel-v2-9-1': 'زنجیر صنعتی',
  'excel-v2-9-2': 'قطعات پمپ',
  'excel-v2-9-3': 'یراق‌آلات و قطعات مکانیکی',
  'excel-v2-9-4': 'چرخ‌های صنعتی',
  'excel-v2-9-5': 'قاشقک الواتور و متعلقات',
  'excel-v2-10-1': 'تجهیزات دستگاه چاپ',
  'excel-v2-10-2': 'تجهیزات روتاری',
  'excel-v2-10-3': 'تجهیزات استاکر و راهنمای کاشی',
  'excel-v2-11-1': 'توری مش صنعتی',
  'excel-v2-12-1': 'ساخت قطعات سفارشی',
  'excel-v2-13-1': 'بلبرینگ صنعتی',
  'excel-v2-13-2': 'یاتاقان و متعلقات',
  'excel-v2-14-1': 'ابر اسفنجی',
  'excel-v2-14-2': 'نوار اسفنجی',
  'excel-v2-14-3': 'اسکاج و ساب صنعتی',
};

export function isBeltCategorySlug(slug: string | undefined | null): boolean {
  return String(slug || '').startsWith('excel-v2-1-');
}

function normalizeFa(input: string): string {
  return String(input || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMachineDecorations(rawName: string): string {
  let name = String(rawName || '').trim();
  name = name.replace(/\s*[—–-]\s*برند\s+[^\n]+$/u, '');
  name = name.replace(/\s*\((?:خارجی|ایرانی)\)\s*/gu, ' ');
  name = name.replace(/\s*\([^()]*\([^()]*\)[^()]*\)/gu, '');
  name = name.replace(/\s*\([^()]*[A-Za-z_]{3,}[^()]*\)/gu, '');
  return name.replace(/\s+/g, ' ').trim();
}

export interface CleanFamilyIdentity {
  targetCategorySlug: string;
  targetCategoryName: string;
  cleanName: string;
  submenuOverride?: string;
}

/**
 * Deterministically normalizes a non-belt family's category placement and clean Persian title.
 * Eliminates all English/machine parenthetical clutter, fixes cross-category misplacements,
 * and consolidates artificially split families.
 */
export function resolveCleanNonBeltFamilyIdentity(product: {
  name?: string;
  categorySlug?: string;
  categoryName?: string;
  resolvedAssignment?: { categorySlug?: string; submenuName?: string; leafName?: string | null };
}): CleanFamilyIdentity {
  const originalSlug = String(product.resolvedAssignment?.categorySlug || product.categorySlug || '');
  const rawName = String(product.name || '').trim();
  const normName = normalizeFa(rawName);
  const upper = rawName.toUpperCase();

  let targetSlug = originalSlug;
  let cleanName = stripMachineDecorations(rawName);
  let submenuOverride: string | undefined;

  // 1. Cross-category misplacement audit fixes (move misplaced families to their true engineering categories)
  if (originalSlug === 'excel-v2-4-1' && /استاکر/.test(normName)) {
    targetSlug = 'excel-v2-10-3';
    cleanName = 'قطعات مکانیکی استاکر';
    submenuOverride = 'قطعات استاکر';
  } else if (originalSlug === 'excel-v2-9-4' && /ریل\s*راهنما/.test(normName)) {
    targetSlug = 'excel-v2-6-1';
    cleanName = 'ریل راهنمای تسمه تفلونی';
    submenuOverride = 'ریل راهنمای تسمه';
  } else if (originalSlug === 'excel-v2-9-3' && /(?:گاید|کشویی\s*راهنما)/.test(normName)) {
    targetSlug = 'excel-v2-6-2';
    cleanName = 'گاید و کشویی راهنمای خط انتقال';
    submenuOverride = 'گاید راهنمای خط انتقال';
  } else if (originalSlug === 'excel-v2-9-3' && /پروفیل\s*قوطی/.test(normName)) {
    targetSlug = 'excel-v2-6-3';
    cleanName = 'پروفیل قوطی صنعتی';
    submenuOverride = 'پروفیل هدایت';
  } else if (originalSlug === 'excel-v2-7-1' && (upper.includes('BUFFER') || /ضربه\s*گیر|لرزه\s*گیر/.test(normName))) {
    targetSlug = 'excel-v2-7-3';
    cleanName = 'ضربه‌گیر و لرزه‌گیر لاستیکی';
    submenuOverride = 'ضربه‌گیر صنعتی';
  } else if (originalSlug === 'excel-v2-7-1' && /واشر\s*لاستیکی/.test(normName)) {
    targetSlug = 'excel-v2-7-2';
    cleanName = 'واشر لاستیکی فلنج';
    submenuOverride = 'واشر و آب‌بند';
  } else if (
    originalSlug === 'excel-v2-7-1' &&
    (/دیافراگم/.test(normName) || upper.includes('PUMP_BALL_SEAT') || /سوپاپ\s*پمپ/.test(normName) || /گلوله\s*لاستیکی/.test(normName))
  ) {
    targetSlug = 'excel-v2-9-2';
    submenuOverride = 'قطعات پمپ دیافراگمی';
    if (/دیافراگم/.test(normName) && /پوسته|نگهدارنده/.test(normName)) {
      cleanName = 'پوسته و نگهدارنده دیافراگم پمپ';
    } else if (/دیافراگم/.test(normName)) {
      cleanName = 'لاستیک دیافراگم پمپ و شیر';
    } else if (upper.includes('PUMP_BALL_SEAT') || /نشیمنگاه|سوپاپ/.test(normName)) {
      cleanName = 'نشیمنگاه لاستیکی سوپاپ پمپ';
    } else {
      cleanName = 'گلوله لاستیکی شیر و پمپ';
    }
  } else {
    // 2. Category-specific clean Persian industrial naming & consolidation
    switch (targetSlug) {
      case 'excel-v2-2-1': {
        if (/PVC/i.test(rawName)) cleanName = 'نوار نقاله PVC';
        else if (/پلی یورتان|\bPU\b/i.test(normName)) cleanName = 'نوار نقاله پلی‌یورتان (PU)';
        else if (/گریپ/.test(normName)) cleanName = 'نوار گریپ نقاله';
        else cleanName = 'نوار نقاله صنعتی';
        break;
      }

      case 'excel-v2-3-1': {
        if (/آجدار|آج دار/.test(normName)) cleanName = 'روکش رولر آجدار';
        else if (/روکش\s*رولر/.test(normName)) cleanName = 'روکش رولر ساده';
        else cleanName = 'رولر و غلتک صنعتی';
        break;
      }

      case 'excel-v2-3-2': {
        if (/بوش/.test(normName)) cleanName = 'بوش رولر';
        else if (/پین/.test(normName)) cleanName = 'پین سر رولر';
        else if (/فنر/.test(normName)) cleanName = 'فنر سر رولر کوره';
        else if (/پایه\s*زیر\s*سر\s*رولر/.test(normName)) cleanName = 'پایه زیر سر رولر';
        else if (/نشیمنگاه/.test(normName)) cleanName = 'نشیمنگاه داخل سر رولر';
        else if (/مخروطی|رول\s*گردان/.test(normName)) cleanName = 'قطعات سر رولر و مخروطی کوره';
        break;
      }

      case 'excel-v2-3-3': {
        if (/خار/.test(normName)) cleanName = 'خار نگهدارنده رولر';
        break;
      }

      case 'excel-v2-4-1': {
        if (/توپی/.test(normName)) cleanName = 'توپی صنعتی';
        else if (upper.includes('PRINT_MACHINE_PULLEY')) cleanName = 'پولی دستگاه چاپ';
        else if (upper.includes('IDLER')) cleanName = 'پولی هرزگرد صنعتی';
        else if (upper.includes('FIXED_DRIVE') || upper.includes('HUB_PULLEY')) cleanName = 'پولی محرک تسمه';
        else if (upper.includes('TIMING_IMPERIAL')) cleanName = 'پولی تایمینگ صنعتی';
        else cleanName = 'پولی شیاری و صنعتی';
        break;
      }

      case 'excel-v2-4-2': {
        cleanName = 'کوپلینگ انتقال قدرت';
        break;
      }

      case 'excel-v2-5-1': {
        cleanName = 'برس سیمی و ساب صنعتی';
        break;
      }

      case 'excel-v2-5-2': {
        if (upper.includes('CYLINDRICAL_ROLLER')) cleanName = 'برس استوانه‌ای رولر';
        else if (upper.includes('EDGE_CLEANING')) cleanName = 'برس تمیزکننده لبه کاشی';
        else if (upper.includes('FLOOR_SWEEPING')) cleanName = 'برس جارویی صنعتی';
        else if (upper.includes('PTFE_BLADE')) cleanName = 'برس تیغه‌ای تفلونی';
        else cleanName = 'برس نواری و خطی صنعتی';
        break;
      }

      case 'excel-v2-6-1': {
        if (/متعلقات\s*سر\s*و\s*انتهای/.test(normName)) cleanName = 'متعلقات سر و انتهای ریل راهنما';
        else cleanName = 'ریل راهنمای تسمه تفلونی';
        break;
      }

      case 'excel-v2-6-2': {
        if (/فنری/.test(normName)) cleanName = 'گاید راهنمای فنری خط انتقال';
        else if (/کشویی/.test(normName)) cleanName = 'گاید و کشویی راهنمای خط انتقال';
        else if (/بست|گیره|پایه/.test(normName)) cleanName = 'بست و پایه نگهدارنده ریل و گاید';
        else if (/استیل|آلومینیوم|فولاد/.test(normName)) cleanName = 'گاید و راهنمای فلزی خط انتقال';
        else cleanName = 'گاید و راهنمای پلیمری و تفلونی';
        break;
      }

      case 'excel-v2-6-3': {
        if (/پروفیل\s*قوطی/.test(normName)) cleanName = 'پروفیل قوطی صنعتی';
        else if (/چهارپهلو/.test(normName)) cleanName = 'پروفیل چهارپهلو توخالی';
        else if (/سر\s*ریل/.test(normName)) cleanName = 'سر ریل هدایت خط انتقال';
        else if (/پایه|براکت/.test(normName)) cleanName = 'پایه و براکت خط هدایت';
        else if (/پین/.test(normName)) cleanName = 'پین هدایت خط انتقال';
        else if (/آلومینیوم|ریل|گاید/.test(normName)) cleanName = 'پروفیل و ریل آلومینیومی';
        else cleanName = 'قطعات خط هدایت صنعتی';
        break;
      }

      case 'excel-v2-6-4': {
        cleanName = 'پایه و گیره نگهدارنده سنسور و فتوسل';
        break;
      }

      case 'excel-v2-7-1': {
        if (/بالمیل/.test(normName)) cleanName = 'لاستیک دور درب بالمیل';
        else if (/گریپ/.test(normName)) cleanName = 'ورق و رول گریپ لاستیکی';
        else if (upper.includes('BUSHING') || upper.includes('SLEEVE') || upper.includes('CORE')) cleanName = 'بوش و آستر لاستیکی';
        else if (upper.includes('EDGE_GRINDER') || upper.includes('EDGE_WIPER')) cleanName = 'لاستیک لبه‌ساب و پاک‌کن خط کاشی';
        else cleanName = 'قطعات لاستیکی قالبی صنعتی';
        break;
      }

      case 'excel-v2-7-2': {
        if (/اورینگ/.test(normName)) cleanName = 'اورینگ آب‌بندی صنعتی';
        else if (/واشر\s*لاستیکی/.test(normName)) cleanName = 'واشر لاستیکی فلنج';
        else cleanName = 'واشر پلی‌یورتان صنعتی';
        break;
      }

      case 'excel-v2-7-3': {
        if (/مکنده/.test(normName) && /سیلیکون/.test(normName)) cleanName = 'مکنده وکیوم سیلیکونی';
        else if (/مکنده/.test(normName)) cleanName = 'مکنده وکیوم صنعتی';
        else if (/ضربه\s*گیر\s*و\s*لرزه\s*گیر\s*لاستیکی/.test(normName)) cleanName = 'ضربه‌گیر و لرزه‌گیر لاستیکی';
        else if (upper.includes('SINGLE_STUD') || upper.includes('DOUBLE_STUD')) cleanName = 'ضربه‌گیر پیچ‌دار صنعتی';
        else if (upper.includes('METAL_BONDED') || upper.includes('BUSHING_BUFFER')) cleanName = 'لرزه‌گیر و ضربه‌گیر فلز-لاستیک';
        else cleanName = 'ضربه‌گیر بلوکی صنعتی';
        break;
      }

      case 'excel-v2-7-4': {
        if (/میلگرد|بوشن/.test(normName)) cleanName = 'میلگرد و بوشن تفلونی و پلیمری';
        else if (/ورق/.test(normName)) cleanName = 'ورق تفلونی و پلی‌یورتان صنعتی';
        else if (/تیغه\s*تسمه/.test(normName)) cleanName = 'تیغه تسمه‌پاک‌کن پلیمری';
        else if (/بوش/.test(normName)) cleanName = 'بوش پلیمری و تفلونی مهندسی';
        else cleanName = 'قطعات پلیمری مهندسی';
        break;
      }

      case 'excel-v2-7-5': {
        if (/سرشیلنگی|رابط/.test(normName)) cleanName = 'سرشیلنگی و رابط شیلنگ';
        else if (/لوله/.test(normName)) cleanName = 'لوله سیلیکونی و آلومینیومی صنعتی';
        else if (/نسوز/.test(normName)) cleanName = 'شیلنگ نسوز صنعتی';
        else if (/سیم دار/.test(normName)) cleanName = 'شیلنگ صنعتی سیم‌دار';
        else cleanName = 'شیلنگ صنعتی ساده و برزنتی';
        break;
      }

      case 'excel-v2-8-1': {
        if (/خروجی\s*کوره/.test(normName)) cleanName = 'نوار برزنتی خروجی کوره';
        else cleanName = 'نوار و ملزومات نسوز کوره';
        break;
      }

      case 'excel-v2-8-2': {
        if (/فویل/.test(normName)) cleanName = 'پارچه نسوز فویل‌دار صنعتی';
        else cleanName = 'عایق و برد نسوز کوره';
        break;
      }

      case 'excel-v2-9-1': {
        if (/سه ردیفه/.test(normName)) cleanName = 'زنجیر صنعتی سه‌ردیفه';
        else if (/دوبل/.test(normName)) cleanName = 'زنجیر صنعتی دوبل';
        else cleanName = 'زنجیر صنعتی تک‌ردیفه';
        break;
      }

      case 'excel-v2-9-2': {
        if (/دیافراگم/.test(normName) && /پوسته|نگهدارنده/.test(normName)) cleanName = 'پوسته و نگهدارنده دیافراگم پمپ';
        else if (/دیافراگم/.test(normName)) cleanName = 'لاستیک دیافراگم پمپ و شیر';
        else if (/نشیمنگاه|سوپاپ/.test(normName)) cleanName = 'نشیمنگاه لاستیکی سوپاپ پمپ';
        else if (/گلوله/.test(normName)) cleanName = 'گلوله لاستیکی شیر و پمپ';
        else if (/پروانه|IMPELLER_STD/i.test(rawName)) cleanName = 'پروانه همزن و پمپ صنعتی';
        else if (upper.includes('PUMP_CASING')) cleanName = 'پوسته و بدنه پمپ صنعتی';
        else cleanName = 'واشر، مهره و قطعات پمپ صنعتی';
        break;
      }

      case 'excel-v2-9-3': {
        if (/بست\s*و\s*پایه|اهرم\s*و\s*پایه|بست\s*صنعتی/.test(normName)) cleanName = 'بست و پایه نگهدارنده صنعتی';
        else if (/تسمه\s*پاک\s*کن/.test(normName)) cleanName = 'مجموعه تسمه‌پاک‌کن استیل';
        else if (/دسته\s*دار|فلکه\s*ای/.test(normName)) cleanName = 'پیچ دسته‌دار و فلکه‌ای تنظیم';
        else if (/استادبولت|متری/.test(normName)) cleanName = 'پیچ متری و استادبولت';
        else if (/پیچ\s*صنعتی/.test(normName)) cleanName = 'پیچ و اتصالات صنعتی';
        else if (/ورق\s*صنعتی/.test(normName)) cleanName = 'ورق فلزی صنعتی';
        else if (/پایه\s*و\s*براکت/.test(normName)) cleanName = 'پایه و براکت صنعتی';
        break;
      }

      case 'excel-v2-9-4': {
        if (/چرخ\s*زنجیر|SPROCKET/i.test(normName)) cleanName = 'چرخ‌زنجیر صنعتی';
        else if (/پالت/.test(normName)) cleanName = 'چرخ‌دنده پالت‌آیزر';
        else if (/پلی یورتان|\bPU\b/i.test(normName)) cleanName = 'چرخ صنعتی پلی‌یورتان';
        else cleanName = 'چرخ صنعتی تفلونی و پلی‌آمید';
        break;
      }

      case 'excel-v2-9-5': {
        cleanName = 'قاشقک الواتور صنعتی';
        break;
      }

      case 'excel-v2-10-1': {
        if (/اسپاتول/.test(normName)) cleanName = 'تیغه و نوار اسپاتول خط چاپ';
        else if (/کارول/.test(normName)) cleanName = 'تیغه کارول چاپ و لعاب';
        else cleanName = 'ملزومات دستگاه چاپ و لعاب‌پاش';
        break;
      }

      case 'excel-v2-10-2': {
        cleanName = 'انگشتی رولر';
        break;
      }

      case 'excel-v2-10-3': {
        if (/ضربه\s*زن|لقمه/.test(normName)) cleanName = 'ضربه‌زن و لقمه پلی‌یورتان استاکر';
        else if (/ضربه\s*گیر/.test(normName)) cleanName = 'ضربه‌گیر استاکر';
        else if (/راهنمای\s*کاشی/.test(normName)) cleanName = 'راهنمای کاشی استاکر';
        else if (/لاستیکی|پلیمری/.test(normName)) cleanName = 'قطعات لاستیکی استاکر';
        else cleanName = 'قطعات مکانیکی استاکر';
        break;
      }

      case 'excel-v2-11-1': {
        cleanName = 'توری مش استیل صنعتی';
        break;
      }

      case 'excel-v2-12-1': {
        if (/قالب/.test(normName)) cleanName = 'قالب صنعتی';
        else if (/درب/.test(normName)) cleanName = 'درب صنعتی';
        else if (/ماژیک/.test(normName)) cleanName = 'ماژیک صنعتی';
        else if (/ترانس|دستگاه/.test(normName)) cleanName = 'ترانس و تجهیزات جانبی صنعتی';
        else cleanName = 'قطعات صنعتی سفارشی';
        break;
      }

      case 'excel-v2-13-1': {
        cleanName = 'بلبرینگ شیارعمیق صنعتی';
        break;
      }

      case 'excel-v2-13-2': {
        if (/حفاظ|کاور/.test(normName)) cleanName = 'حفاظ و کاور محافظ یاتاقان';
        else if (/کفی/.test(normName)) cleanName = 'کفی یاتاقان صنعتی';
        else cleanName = 'مهره یاتاقان صنعتی';
        break;
      }

      case 'excel-v2-14-1': {
        cleanName = 'فوم و ابر اسفنجی صنعتی';
        break;
      }

      case 'excel-v2-14-2': {
        if (/سیلیکون/.test(normName)) cleanName = 'نوار اسفنجی سیلیکونی نسوز';
        else cleanName = 'نوار اسفنجی صنعتی';
        break;
      }

      case 'excel-v2-14-3': {
        cleanName = 'اسکاج ساب صنعتی';
        break;
      }

      default:
        break;
    }
  }

  return {
    targetCategorySlug: targetSlug,
    targetCategoryName: CATEGORY_TITLES[targetSlug] || product.categoryName || 'قطعات صنعتی',
    cleanName: cleanName || rawName,
    submenuOverride,
  };
}

/**
 * Determines the engineering-true category slug for a legacy directSku before absorbing it into a host family.
 */
export function resolveTrueCategoryForDirectSku(sku: {
  name?: string;
  categorySlug?: string;
  submenu?: string;
  subcategory?: string;
}): string {
  const orig = String(sku.categorySlug || '').trim();
  const text = normalizeFa(`${sku.name || ''} ${sku.submenu || ''} ${sku.subcategory || ''}`);

  if (/اسکاج\s*ساب|اسکاچ\s*ساب|ساب\s*کد/.test(text)) return 'excel-v2-14-3';
  if (/لاستیک\s*کوپلینگ|کوپلینگ|کوبلینگ|ضربه\s*گیر\s*کوپلینگ/.test(text)) return 'excel-v2-4-2';
  if (/بوش\s*سر\s*رولر|بوش\s*بغل\s*رولر|بوش\s*دنده\s*رولر|پین\s*سر\s*رولر|فنر\s*سر\s*رول/.test(text)) {
    return 'excel-v2-3-2';
  }
  if (/دیافراگم\s*پمپ|سوپاپ\s*پمپ|پروانه\s*پمپ|پروانه\s*همزن|پوسته\s*پمپ/.test(text)) {
    return 'excel-v2-9-2';
  }
  if (/استاکر/.test(text) && orig === 'excel-v2-4-1') return 'excel-v2-10-3';
  if (/گاید|اهرم\s*گاید|کشویی\s*راهنما/.test(text) && (orig === 'excel-v2-9-3' || orig === 'excel-v2-6-3')) {
    return 'excel-v2-6-2';
  }
  if (/ریل\s*راهنما/.test(text) && orig === 'excel-v2-9-4') return 'excel-v2-6-1';
  if (/ضربه\s*گیر|لرزه\s*گیر|مکنده/.test(text) && orig === 'excel-v2-7-1') return 'excel-v2-7-3';
  if (/اورینگ|واشر\s*لاستیکی/.test(text) && orig === 'excel-v2-7-1') return 'excel-v2-7-2';

  return orig || 'excel-v2-12-1';
}

function chooseHostFamilyForDirectSku(sku: any, categoryFamilies: any[], targetSlug: string): any | null {
  if (!categoryFamilies.length) return null;
  if (categoryFamilies.length === 1) return categoryFamilies[0];

  const text = normalizeFa(`${sku.name || ''} ${sku.submenu || ''} ${sku.subcategory || ''}`);

  const findByPattern = (re: RegExp) =>
    categoryFamilies.find((f) => re.test(normalizeFa(f.name || '')));

  // Targeted engineering rules for high-density categories
  if (targetSlug === 'excel-v2-3-2') {
    if (/پین/.test(text)) return findByPattern(/پین/) || categoryFamilies[0];
    if (/فنر/.test(text)) return findByPattern(/فنر/) || categoryFamilies[0];
    if (/بوش/.test(text)) return findByPattern(/بوش/) || categoryFamilies[0];
    if (/پایه\s*زیر/.test(text)) return findByPattern(/پایه/) || categoryFamilies[0];
    if (/نشیمنگاه/.test(text)) return findByPattern(/نشیمنگاه/) || categoryFamilies[0];
    return findByPattern(/مخروطی|سر\s*رولر/) || categoryFamilies[0];
  }

  if (targetSlug === 'excel-v2-9-2') {
    if (/پروانه|همزن/.test(text)) return findByPattern(/پروانه/) || categoryFamilies[0];
    if (/دیافراگم/.test(text) && /پوسته|نگهدارنده/.test(text)) return findByPattern(/پوسته.*دیافراگم/) || categoryFamilies[0];
    if (/دیافراگم/.test(text)) return findByPattern(/دیافراگم/) || categoryFamilies[0];
    if (/سوپاپ|نشیمنگاه/.test(text)) return findByPattern(/نشیمنگاه|سوپاپ/) || categoryFamilies[0];
    if (/گلوله/.test(text)) return findByPattern(/گلوله/) || categoryFamilies[0];
    if (/پوسته|بدنه/.test(text)) return findByPattern(/پوسته/) || categoryFamilies[0];
    return findByPattern(/واشر|قطعات\s*پمپ/) || categoryFamilies[0];
  }

  if (targetSlug === 'excel-v2-9-3') {
    if (/دسته\s*دار|فلکه/.test(text)) return findByPattern(/دسته\s*دار|فلکه/) || categoryFamilies[0];
    if (/استادبولت|متری/.test(text)) return findByPattern(/استادبولت|متری/) || categoryFamilies[0];
    if (/تسمه\s*پاک/.test(text)) return findByPattern(/تسمه\s*پاک/) || categoryFamilies[0];
    if (/بست|گیره|اهرم/.test(text)) return findByPattern(/بست/) || categoryFamilies[0];
    if (/پایه|براکت/.test(text)) return findByPattern(/پایه|براکت/) || categoryFamilies[0];
    if (/ورق/.test(text)) return findByPattern(/ورق/) || categoryFamilies[0];
    return findByPattern(/پیچ/) || categoryFamilies[0];
  }

  if (targetSlug === 'excel-v2-7-3') {
    if (/مکنده/.test(text) && /سیلیکون/.test(text)) return findByPattern(/سیلیکونی/) || findByPattern(/مکنده/) || categoryFamilies[0];
    if (/مکنده/.test(text)) return findByPattern(/مکنده/) || categoryFamilies[0];
    if (/پیچ/.test(text)) return findByPattern(/پیچ\s*دار/) || categoryFamilies[0];
    if (/فلز|روکش/.test(text)) return findByPattern(/فلز/) || categoryFamilies[0];
    return findByPattern(/ضربه\s*گیر/) || categoryFamilies[0];
  }

  if (targetSlug === 'excel-v2-4-1') {
    if (/توپی/.test(text)) return findByPattern(/توپی/) || categoryFamilies[0];
    if (/چاپ/.test(text)) return findByPattern(/چاپ/) || categoryFamilies[0];
    if (/هرزگرد/.test(text)) return findByPattern(/هرزگرد/) || categoryFamilies[0];
    if (/تایمینگ/.test(text)) return findByPattern(/تایمینگ/) || categoryFamilies[0];
    return findByPattern(/شیاری|محرک/) || categoryFamilies[0];
  }

  if (targetSlug === 'excel-v2-6-2') {
    if (/فنری/.test(text)) return findByPattern(/فنری/) || categoryFamilies[0];
    if (/بست|گیره|پایه/.test(text)) return findByPattern(/بست|پایه/) || categoryFamilies[0];
    if (/فلز|استیل|آلومینیوم|فولاد/.test(text)) return findByPattern(/فلزی/) || categoryFamilies[0];
    return findByPattern(/کشویی|پلیمری/) || categoryFamilies[0];
  }

  // Generic token-overlap scoring across families in the same category
  const skuTokens = new Set(text.split(/\s+/).filter((t) => t.length >= 2));
  let bestFam = categoryFamilies[0];
  let bestScore = -1;

  for (const fam of categoryFamilies) {
    const famText = normalizeFa(`${fam.name || ''} ${fam.submenu || ''} ${fam.subcategory || ''}`);
    let score = 0;
    for (const tok of skuTokens) {
      if (famText.includes(tok)) score += tok.length;
    }
    // Slight preference for larger host family on ties
    const tieBreaker = Math.min(2, (fam.variants?.length || 0) / 100);
    if (score + tieBreaker > bestScore) {
      bestScore = score + tieBreaker;
      bestFam = fam;
    }
  }

  return bestFam;
}

/**
 * Absorbs 100% of standalone `directSkus` into their engineering-true categories and host families.
 * - Leaves `engineeredCatalog.directSkus = []`.
 * - Preserves 100% of SKU codes, names, specs, prices, and unique images.
 * - Registers legacy aliases so old `/direct-product/:code` links resolve cleanly to the host family.
 */
export function absorbDirectSkusIntoFamilies(engineeredCatalog: any): DirectSkuAbsorptionResult {
  const directSkus: any[] = Array.isArray(engineeredCatalog.directSkus) ? engineeredCatalog.directSkus : [];
  if (directSkus.length === 0) {
    return {
      beforeDirectSkus: 0,
      afterDirectSkus: 0,
      absorbedIntoExistingFamily: 0,
      createdNewFamilies: 0,
      reassignedDirectCategoryCount: 0,
      aliasesAdded: 0,
    };
  }

  const products: any[] = Array.isArray(engineeredCatalog.products) ? engineeredCatalog.products : [];
  const byCategory = new Map<string, any[]>();
  const existingVariantCodes = new Set<string>();

  for (const p of products) {
    const slug = String(p.resolvedAssignment?.categorySlug || p.categorySlug || '');
    const list = byCategory.get(slug) || [];
    list.push(p);
    byCategory.set(slug, list);
    for (const v of p.variants || []) {
      const k = String(v?.code || '').trim().toLowerCase();
      if (k) existingVariantCodes.add(k);
    }
  }

  const aliasMap = new Map<string, { newFamilyCode?: string; directSkuCode?: string }>(
    Array.isArray(engineeredCatalog.aliases) ? engineeredCatalog.aliases : [],
  );

  let absorbedIntoExistingFamily = 0;
  let createdNewFamilies = 0;
  let reassignedDirectCategoryCount = 0;
  let aliasesAdded = 0;

  for (const d of directSkus) {
    const skuCode = String(d?.skuCode || d?.code || '').trim();
    if (!skuCode) continue;

    const origSlug = String(d.categorySlug || '').trim();
    const targetSlug = resolveTrueCategoryForDirectSku(d);
    if (targetSlug !== origSlug) reassignedDirectCategoryCount++;

    let catFamilies = byCategory.get(targetSlug) || [];
    let hostFamily = chooseHostFamilyForDirectSku(d, catFamilies, targetSlug);

    if (!hostFamily) {
      const catTitle = CATEGORY_TITLES[targetSlug] || d.categoryName || 'قطعات صنعتی';
      const unifiedName = targetSlug === 'excel-v2-14-3' ? 'اسکاج ساب صنعتی' : catTitle;
      hostFamily = {
        code: `PFAM-${targetSlug.toUpperCase()}-UNIFIED`,
        name: unifiedName,
        brand: d.brand || '',
        categorySlug: targetSlug,
        categoryName: catTitle,
        subcategory: d.submenu || d.subcategory || catTitle,
        submenu: d.submenu || d.subcategory || catTitle,
        unit: d.unit || 'عدد',
        description: `مجموعه کامل ${unifiedName}`,
        prices: {
          base: Number(d.priceSnapshot?.retailPrice || d.priceSnapshot?.price || 0),
          retail: Number(d.priceSnapshot?.retailPrice || d.priceSnapshot?.price || 0),
          wholesale: Number(d.priceSnapshot?.wholesalePrice || d.priceSnapshot?.price || 0),
          dealer: Number(d.priceSnapshot?.dealerPrice || d.priceSnapshot?.price || 0),
        },
        images: d.imageUrl ? [d.imageUrl] : [],
        image: d.imageUrl || undefined,
        galleryImages: [],
        technicalSpecs: Array.isArray(d.technicalSpecs) ? d.technicalSpecs.slice(0, 6) : [],
        tags: [],
        variants: [],
        legacyFamilyCodes: [],
        stock: 0,
        stockKnown: false,
        inquiryOnly: true,
        resolvedAssignment: {
          categorySlug: targetSlug,
          submenuName: d.submenu || d.subcategory || catTitle,
          leafName: null,
          method: 'direct_sku_absorbed_v2',
        },
      };
      products.push(hostFamily);
      catFamilies = [hostFamily];
      byCategory.set(targetSlug, catFamilies);
      createdNewFamilies++;
    } else {
      absorbedIntoExistingFamily++;
    }

    const skuKey = skuCode.toLowerCase();
    if (!existingVariantCodes.has(skuKey)) {
      existingVariantCodes.add(skuKey);
      const retail = Number(d.priceSnapshot?.retailPrice || d.priceSnapshot?.price || 0);
      const variantEntry = {
        code: skuCode,
        name: String(d.name || skuCode).trim(),
        size: String(d.size || '').trim(),
        model: String(d.model || '').trim() || undefined,
        brand: d.brand || hostFamily.brand || '',
        unit: d.unit || hostFamily.unit || 'عدد',
        prices: {
          base: retail,
          retail,
          wholesale: Number(d.priceSnapshot?.wholesalePrice || retail),
          dealer: Number(d.priceSnapshot?.dealerPrice || retail),
        },
        images: d.imageUrl ? [d.imageUrl] : [],
        image: d.imageUrl || undefined,
        technicalSpecs: Array.isArray(d.technicalSpecs) ? d.technicalSpecs : [],
        stock: Number(d.priceSnapshot?.stock || 0),
        stockKnown: d.priceSnapshot?.stockKnown === true,
        inquiryOnly: retail <= 0,
      };
      if (!Array.isArray(hostFamily.variants)) hostFamily.variants = [];
      hostFamily.variants.push(variantEntry);
      if (d.imageUrl && (!hostFamily.images || hostFamily.images.length === 0)) {
        hostFamily.images = [d.imageUrl];
        hostFamily.image = d.imageUrl;
      }
      hostFamily.stock = hostFamily.variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0);
      hostFamily.inquiryOnly = hostFamily.variants.every((v: any) => v.inquiryOnly !== false);
    }

    // Register legacy alias for seamless lookup/redirect
    if (!aliasMap.has(skuCode)) aliasesAdded++;
    aliasMap.set(skuCode, { newFamilyCode: hostFamily.code });
    if (skuKey !== skuCode) {
      aliasMap.set(skuKey, { newFamilyCode: hostFamily.code });
    }
  }

  engineeredCatalog.products = products;
  engineeredCatalog.directSkus = [];
  engineeredCatalog.aliases = Array.from(aliasMap.entries());

  return {
    beforeDirectSkus: directSkus.length,
    afterDirectSkus: 0,
    absorbedIntoExistingFamily,
    createdNewFamilies,
    reassignedDirectCategoryCount,
    aliasesAdded,
  };
}

/**
 * Organizes all non-belt families in engineeredCatalog in-place:
 * - Preserves 100% of belt families untouched.
 * - Cleans all machine/English non-belt family names to clean Persian industrial names.
 * - Fixes misplaced non-belt category assignments.
 * - Consolidates fragmented families sharing the same (categorySlug, cleanName) while preserving
 *   100% of SKUs and recording every merged old family code in legacyFamilyCodes + aliases.
 */
export function organizeNonBeltCatalog(engineeredCatalog: any): NonBeltOrganizationResult {
  const products: any[] = Array.isArray(engineeredCatalog.products) ? engineeredCatalog.products : [];
  const beltProducts: any[] = [];
  const nonBeltProducts: any[] = [];

  for (const p of products) {
    const slug = p.resolvedAssignment?.categorySlug || p.categorySlug || '';
    if (isBeltCategorySlug(slug)) {
      beltProducts.push(p);
    } else {
      nonBeltProducts.push(p);
    }
  }

  const byCategoryBefore = new Map<string, number>();
  for (const p of nonBeltProducts) {
    const slug = p.resolvedAssignment?.categorySlug || p.categorySlug || 'unknown';
    byCategoryBefore.set(slug, (byCategoryBefore.get(slug) || 0) + 1);
  }

  const groups = new Map<string, { identity: CleanFamilyIdentity; members: any[] }>();
  let reassignedCategoryCount = 0;
  let cleanedNameCount = 0;

  for (const p of nonBeltProducts) {
    const origSlug = p.resolvedAssignment?.categorySlug || p.categorySlug || '';
    const identity = resolveCleanNonBeltFamilyIdentity(p);
    if (identity.targetCategorySlug !== origSlug) reassignedCategoryCount++;
    if (identity.cleanName !== String(p.name || '').trim()) cleanedNameCount++;

    const groupKey = `${identity.targetCategorySlug}::${identity.cleanName}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.members.push(p);
    } else {
      groups.set(groupKey, { identity, members: [p] });
    }
  }

  const consolidatedNonBelts: any[] = [];
  const oldToNewFamilyCode = new Map<string, string>();
  let mergedFamiliesCount = 0;
  let preservedSkuCount = 0;

  for (const { identity, members } of groups.values()) {
    const sortedMembers = [...members].sort((a, b) => {
      const lenDiff = (b.variants?.length || 0) - (a.variants?.length || 0);
      if (lenDiff !== 0) return lenDiff;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });

    const primary = sortedMembers[0];
    const mergedVariants: any[] = [];
    const seenVariantCodes = new Set<string>();
    const legacyCodes = new Set<string>(Array.isArray(primary.legacyFamilyCodes) ? primary.legacyFamilyCodes : []);
    const tagSet = new Set<string>(Array.isArray(primary.tags) ? primary.tags : []);
    const specMap = new Map<string, { key: string; value: string }>();
    const mergedImages: string[] = [];
    const seenImages = new Set<string>();
    const mergedGallery: any[] = [];
    const seenGalleryUrls = new Set<string>();

    for (const member of sortedMembers) {
      if (member.code !== primary.code) {
        mergedFamiliesCount++;
        legacyCodes.add(String(member.code));
        oldToNewFamilyCode.set(String(member.code), String(primary.code));
      }
      for (const oldCode of member.legacyFamilyCodes || []) {
        if (oldCode && oldCode !== primary.code) {
          legacyCodes.add(String(oldCode));
          oldToNewFamilyCode.set(String(oldCode), String(primary.code));
        }
      }
      for (const tag of member.tags || []) {
        if (tag && !/[A-Z]{3,}_[A-Z]{2,}/.test(String(tag))) tagSet.add(String(tag));
      }
      for (const spec of member.technicalSpecs || []) {
        if (spec?.key && spec?.value && !specMap.has(spec.key)) {
          specMap.set(spec.key, { key: String(spec.key), value: String(spec.value) });
        }
      }
      for (const img of member.images || []) {
        const u = String(img || '').trim();
        if (u && !seenImages.has(u)) {
          seenImages.add(u);
          mergedImages.push(u);
        }
      }
      for (const g of member.galleryImages || []) {
        const u = String(g?.url || '').trim();
        if (u && !seenGalleryUrls.has(u)) {
          seenGalleryUrls.add(u);
          mergedGallery.push(g);
        }
      }
      for (const v of member.variants || []) {
        const vKey = String(v?.code || '').trim().toLowerCase();
        if (!vKey || seenVariantCodes.has(vKey)) continue;
        seenVariantCodes.add(vKey);
        mergedVariants.push({ ...v });
      }
    }

    preservedSkuCount += mergedVariants.length;

    const consolidated = {
      ...primary,
      name: identity.cleanName,
      categorySlug: identity.targetCategorySlug,
      categoryName: identity.targetCategoryName,
      subcategory: identity.submenuOverride || primary.resolvedAssignment?.submenuName || primary.subcategory || identity.targetCategoryName,
      submenu: identity.submenuOverride || primary.resolvedAssignment?.submenuName || primary.submenu || identity.targetCategoryName,
      resolvedAssignment: {
        ...(primary.resolvedAssignment || {}),
        categorySlug: identity.targetCategorySlug,
        submenuName: identity.submenuOverride || primary.resolvedAssignment?.submenuName || identity.targetCategoryName,
        leafName: primary.resolvedAssignment?.leafName || null,
        method: 'non_belt_organized_v2',
      },
      legacyFamilyCodes: Array.from(legacyCodes),
      tags: Array.from(tagSet).slice(0, 12),
      technicalSpecs: Array.from(specMap.values()).slice(0, 8),
      images: mergedImages,
      image: mergedImages[0] || undefined,
      galleryImages: mergedGallery,
      variants: mergedVariants,
      stock: mergedVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0),
      stockKnown: mergedVariants.length > 0 && mergedVariants.every((v) => v.stockKnown === true),
      inquiryOnly: mergedVariants.length === 0 || mergedVariants.every((v) => v.inquiryOnly !== false),
    };

    delete consolidated.beltProfile;
    consolidatedNonBelts.push(consolidated);
  }

  engineeredCatalog.products = [...beltProducts, ...consolidatedNonBelts];

  const aliasEntries: Array<[string, { newFamilyCode?: string; directSkuCode?: string }]> = Array.isArray(
    engineeredCatalog.aliases,
  )
    ? engineeredCatalog.aliases
    : [];
  const aliasMap = new Map<string, { newFamilyCode?: string; directSkuCode?: string }>();
  for (const [k, v] of aliasEntries) {
    if (v?.newFamilyCode && oldToNewFamilyCode.has(v.newFamilyCode)) {
      aliasMap.set(k, { ...v, newFamilyCode: oldToNewFamilyCode.get(v.newFamilyCode) });
    } else {
      aliasMap.set(k, v);
    }
  }
  let aliasesAdded = 0;
  for (const [oldCode, newCode] of oldToNewFamilyCode.entries()) {
    if (!aliasMap.has(oldCode)) {
      aliasesAdded++;
    }
    aliasMap.set(oldCode, { newFamilyCode: newCode });
    const lowerOld = oldCode.toLowerCase();
    if (lowerOld !== oldCode && !aliasMap.has(lowerOld)) {
      aliasMap.set(lowerOld, { newFamilyCode: newCode });
    }
  }
  engineeredCatalog.aliases = Array.from(aliasMap.entries());

  const byCategory: Record<string, { before: number; after: number; skus: number }> = {};
  for (const [slug, before] of byCategoryBefore.entries()) {
    byCategory[slug] = { before, after: 0, skus: 0 };
  }
  for (const p of consolidatedNonBelts) {
    const slug = p.resolvedAssignment?.categorySlug || p.categorySlug || 'unknown';
    if (!byCategory[slug]) byCategory[slug] = { before: 0, after: 0, skus: 0 };
    byCategory[slug].after += 1;
    byCategory[slug].skus += p.variants?.length || 0;
  }

  return {
    beforeNonBeltFamilies: nonBeltProducts.length,
    afterNonBeltFamilies: consolidatedNonBelts.length,
    mergedFamiliesCount,
    reassignedCategoryCount,
    cleanedNameCount,
    preservedSkuCount,
    aliasesAdded,
    byCategory,
  };
}
