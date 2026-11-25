import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  Ruler,
  Search,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';
import { BeltMarkingCalibrationStudio } from '../components/BeltMarkingCalibrationStudio';

interface EngineeringAuditRecord {
  skuCode: string;
  familyCode: string;
  brand: string;
  profile: string;
  targetMarkingCode: string;
  standardReference: string;
  constructionFa: string;
  masterAnchorSku: string;
  masterBasePhotoPath: string;
  masterSourceUrl: string;
  masterReadMarking: string;
  engineeringVerdict:
    | 'COMPATIBLE_EXACT_MASTER'
    | 'COMPATIBLE_MARKING_ADAPTABLE'
    | 'INCOMPATIBLE_BRAND'
    | 'INCOMPATIBLE_STRUCTURE';
  finalImageClassification:
    | 'EXACT_PHYSICAL_MARKING'
    | 'MASTER_ENHANCED_MARKING_ADAPTED'
    | 'FAMILY_VERIFIED_REAL_PHOTO'
    | 'DEDICATED_REAL_WEB_PHOTO';
  finalImagePath: string;
  mismatchFactors: string[];
  reasonFa: string;
}

interface EngineeringReportResponse {
  success: boolean;
  generatedAt: string;
  totals: Record<string, number>;
  totalMatched: number;
  limit: number;
  offset: number;
  items: EngineeringAuditRecord[];
}

interface VisualMarkingCheckItem {
  key: string;
  labelFa: string;
  passed: boolean;
  metric: string;
  detailFa: string;
}

interface VisualValidationReport {
  targetId: string;
  masterId: string;
  brandExpected: string;
  brandOnImage: string;
  profileExpected: string;
  codePrinted: string;
  constructionExpected: string;
  masterConstruction: string;
  isBrandedMaster: boolean;
  imageWidth: number;
  imageHeight: number;
  logoOverlapIoU: number;
  seamDeltaRgb: number;
  beltLandingRatio: number;
  bgSpillRatio: number;
  score: number;
  verdict: 'PASS_VERIFIED' | 'WARN_MINOR_ADJUST' | 'FAIL_REJECTED';
  checks: VisualMarkingCheckItem[];
  imagePublicPath: string;
}

interface VisualMastersAuditPayload {
  success: boolean;
  generatedAt: string;
  totalMasters: number;
  passedCount: number;
  warnCount: number;
  failedCount: number;
  averageScore: number;
  reports: VisualValidationReport[];
}

interface AuditSummaryPayload {
  generatedAt: string;
  reconciliation: {
    totalWarehouseSkus: number;
    totalAuditedBeltCohortSkus: number;
    totalSourceBeltFamilies: number;
    totalProposedEngineeringFamilies: number;
    totalRuntimePfamFamilies: number;
    totalRuntimeStandaloneDirectSkus: number;
    skuStatusBreakdown: {
      CORRECT_FAMILY: number;
      STANDALONE_CANDIDATE: number;
      FAMILY_MISMATCH: number;
      OUT_OF_SCOPE: number;
      PENDING_REVIEW: number;
    };
    globalUnassignedPoolTotal: number;
    reassignedSkusTotal: number;
  };
  imageAuditSummary: {
    totalBeltFamiliesAudited: number;
    familiesWithVerifiedUniqueRealPhotos: number;
    totalVerifiedUniqueFamilyPhotoSlots: number;
    familiesWithEngineeringSpecSheet: number;
    skusWithVerifiedRealMarkingPhoto: number;
    skusWithVerifiedTechnicalDrawing: number;
    skusHeldWithoutDrawingPendingDimensions: number;
    rejectedCandidateImagesCount: number;
    duplicateAssignmentsRemovedCount: number;
  };
  deliverables: Array<{
    id: number;
    filename: string;
    rows: number;
    descriptionFa: string;
  }>;
  pilotShowcase: Array<{
    pilotOrder: number;
    sourceFamilyId: string;
    proposedFamilyId: string;
    runtimePfamId: string;
    titleFa: string;
    titleEn: string;
    brand: string;
    profile: string;
    beltDivision: string;
    supplyForm: string;
    standardReference: string;
    bodyMaterial: string;
    tensileCord: string;
    totalMemberSkus: number;
    excludedIncompatibleSkusCount: number;
    excludedIncompatibleSkusSample: Array<{ sku: string; reason: string }>;
    manufacturerUrl: string;
    familySlots: Array<{
      slotNumber: number;
      slotName: string;
      status: string;
      url: string | null;
      originalSourceUrl: string | null;
      sourcePageUrl: string | null;
      noteFa: string;
    }>;
    specSheetUrl: string;
    sampleSkus: Array<{
      sku: string;
      rawTitle: string;
      rawSize: string;
      unit: string;
      sourceFamilyId: string;
      proposedFamilyId: string;
      runtimePfamId: string;
      auditStatus: string;
      recommendedAction: string;
      profile: string;
      widthMm: number | null;
      pitchLengthMm: number | null;
      insideLengthMm: number | null;
      toothCount: number | null;
      realMarkingPhoto: {
        status: string;
        url: string | null;
        originalSourceUrl: string | null;
        sourcePageUrl: string | null;
        visibleMarking: string | null;
        noteFa: string;
      };
      technicalDrawingUrl: string;
      profileDrawingUrl: string;
    }>;
  }>;
  sampleReassignments: Array<Record<string, string>>;
  sampleGlobalUnassigned: Array<Record<string, string>>;
  sampleRejectedImages: Array<Record<string, string>>;
  sampleDuplicateImages: Array<Record<string, string>>;
  manufacturerSources: Array<{
    brandCode: string;
    manufacturerName: string;
    officialWebsite: string;
    verifiedSeriesInCatalog: string[];
    technicalCatalogUrls: string[];
  }>;
}

export const BeltMasterAuditPage: React.FC = () => {
  const [data, setData] = useState<AuditSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'engineering' | 'visual' | 'studio' | 'pilot' | 'deliverables' | 'reassignments' | 'images'>('engineering');
  const [engReport, setEngReport] = useState<EngineeringReportResponse | null>(null);
  const [engLoading, setEngLoading] = useState(false);
  const [engQuery, setEngQuery] = useState('');
  const [engVerdict, setEngVerdict] = useState('ALL');
  const [engClass, setEngClass] = useState('ALL');
  const [engOffset, setEngOffset] = useState(0);
  const [visualAudit, setVisualAudit] = useState<VisualMastersAuditPayload | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [skuCheckInput, setSkuCheckInput] = useState('11226');
  const [skuCheckLoading, setSkuCheckLoading] = useState(false);
  const [skuCheckError, setSkuCheckError] = useState<string | null>(null);
  const [skuCheckReport, setSkuCheckReport] = useState<VisualValidationReport | null>(null);

  useEffect(() => {
    fetch('/api/belt-audit/summary')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== 'visual' || visualAudit) return;
    const controller = new AbortController();
    setVisualLoading(true);
    fetch('/api/belt-audit/visual-validation', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!controller.signal.aborted && json?.success) {
          setVisualAudit(json);
        }
        if (!controller.signal.aborted) setVisualLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setVisualLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, visualAudit]);

  const runLiveSkuValidation = async (rawCode?: string) => {
    const val = (rawCode ?? skuCheckInput).trim();
    if (!val) return;
    setSkuCheckLoading(true);
    setSkuCheckError(null);
    try {
      const param = val.startsWith('PFAM-') || val.startsWith('FAM-') ? `family=${encodeURIComponent(val)}` : `sku=${encodeURIComponent(val)}`;
      const res = await fetch(`/api/belt-audit/visual-validation?${param}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setSkuCheckReport(null);
        setSkuCheckError(json?.error || 'اعتبارسنجی با خطا مواجه شد.');
      } else {
        setSkuCheckReport(json.report);
      }
    } catch {
      setSkuCheckError('خطا در ارتباط با سرویس اعتبارسنجی بصری.');
    } finally {
      setSkuCheckLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'engineering') return;
    const controller = new AbortController();
    setEngLoading(true);
    const qs = new URLSearchParams();
    qs.set('limit', '30');
    qs.set('offset', String(engOffset));
    if (engQuery.trim()) qs.set('q', engQuery.trim());
    if (engVerdict !== 'ALL') qs.set('verdict', engVerdict);
    if (engClass !== 'ALL') qs.set('classification', engClass);

    fetch(`/api/belt-audit/engineering-report?${qs.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!controller.signal.aborted && json?.success) {
          setEngReport(json);
        }
        if (!controller.signal.aborted) setEngLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEngLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, engQuery, engVerdict, engClass, engOffset]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center" dir="rtl">
        <div className="inline-block w-8 h-8 border-4 border-[#E06518] border-t-transparent rounded-full animate-spin" />
        <p className="mt-3 text-sm font-bold text-slate-600">
          در حال بارگذاری گزارش ممیزی جامع مهندسی تسمه‌های صنعتی...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center" dir="rtl">
        <p className="text-sm font-bold text-rose-600">خطا در بارگذاری داده‌های ممیزی تسمه.</p>
      </div>
    );
  }

  const { reconciliation, imageAuditSummary } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6" dir="rtl">
      {/* Header Banner */}
      <section className="rounded-3xl bg-[#2B313A] text-white p-6 sm:p-8 shadow-md border border-slate-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>گزارش اجرایی دستور مادر جامع صنعت پیش — مهندسی خانواده‌ها و ممیزی تصاویر تسمه صنعتی</span>
          </div>
          <Link
            to="/category/excel-v2-1-1"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
          >
            <span>بازگشت به کاتالوگ تسمه‌ها</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black leading-snug">
            مرکز ممیزی مهندسی خانواده‌های تسمه، بازتخصیص کدهای کالا و بانک تصاویر تاییدشده
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-4xl leading-6">
            اجرای کامل قوانین ۶گانه غیرقابل مذاکره: بدون جعل اطلاعات، بدون حذف هیچ کد کالا ({toPersianDigits(reconciliation.totalAuditedBeltCohortSkus.toLocaleString('en-US'))} کد ممیزی تسمه از {toPersianDigits(reconciliation.totalWarehouseSkus.toLocaleString('en-US'))} کد کل انبار)، جداسازی کامل شناسه‌های <span dir="ltr" className="inline-block font-mono">FAM-*</span> و <span dir="ltr" className="inline-block font-mono">PFAM-*</span>، حذف {toPersianDigits(imageAuditSummary.duplicateAssignmentsRemovedCount.toLocaleString('en-US'))} انتساب عکس تکراری بین خانواده‌ها (<span dir="ltr" className="inline-block font-mono">REJECTED_DUPLICATE</span>) و حذف {toPersianDigits(imageAuditSummary.rejectedCandidateImagesCount.toLocaleString('en-US'))} تصویر اشتباه یا فاقد مجوز (<span dir="ltr" className="inline-block font-mono">REJECTED_WRONG_PRODUCT</span>).
          </p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">کل کدهای ممیزی تسمه</div>
            <div className="text-xl font-black text-white">
              {toPersianDigits(reconciliation.totalAuditedBeltCohortSkus.toLocaleString('en-US'))}
            </div>
            <div className="text-[10px] text-emerald-300 font-bold">۰ کد گمشده یا حذف‌شده</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">کدهای همگن در خانواده</div>
            <div className="text-xl font-black text-emerald-400">
              {toPersianDigits(
                (
                  reconciliation.skuStatusBreakdown.CORRECT_FAMILY +
                  reconciliation.skuStatusBreakdown.STANDALONE_CANDIDATE
                ).toLocaleString('en-US'),
              )}
            </div>
            <div className="text-[10px] text-slate-300">
              شامل {toPersianDigits(reconciliation.skuStatusBreakdown.STANDALONE_CANDIDATE)} تک‌کد مستقل
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">مخزن بازتخصیص سراسری</div>
            <div className="text-xl font-black text-amber-400">
              {toPersianDigits(reconciliation.skuStatusBreakdown.FAMILY_MISMATCH.toLocaleString('en-US'))}
            </div>
            <div className="text-[10px] text-slate-300">کد منتقل‌شده به خانواده واقعی</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">کالاهای غیرتسمه‌ای خارج‌شده</div>
            <div className="text-xl font-black text-sky-300">
              {toPersianDigits(reconciliation.skuStatusBreakdown.OUT_OF_SCOPE)}
            </div>
            <div className="text-[10px] text-slate-300">پولی/قالب/یاتاقان (<bdi dir="ltr" className="font-mono">OUT_OF_SCOPE</bdi>)</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">تصاویر تکراری حذف‌شده</div>
            <div className="text-xl font-black text-rose-400">
              {toPersianDigits(imageAuditSummary.duplicateAssignmentsRemovedCount.toLocaleString('en-US'))}
            </div>
            <div className="text-[10px] text-slate-300"><bdi dir="ltr" className="font-mono">REJECTED_DUPLICATE</bdi> (قانون ۴)</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-300">فایل‌های خروجی استاندارد</div>
            <div className="text-xl font-black text-orange-400 tabular-nums">
              {toPersianDigits(data.deliverables.length)} فایل
            </div>
            <div className="text-[10px] text-slate-300">آماده دانلود مستقیم CSV/JSON/MD</div>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('engineering')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'engineering'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>تایید مارکینگ فیزیکی و موتور مهندسی تصاویر</span>
        </button>

        <button
          type="button"
          data-testid="tab-visual-validation"
          onClick={() => setActiveTab('visual')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'visual'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <ScanEye className="w-4 h-4" />
          <span>اعتبارسنجی بصری مارکینگ و هندسه (۳۷ مستر)</span>
        </button>

        <button
          type="button"
          data-testid="tab-calibration-studio"
          onClick={() => setActiveTab('studio')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'studio'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>استودیوی تنظیم زنده مارکینگ (۳۷ مستر)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pilot')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'pilot'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>
            پایلوت اجرایی ({toPersianDigits(data.pilotShowcase.length)} خانواده منتخب و{' '}
            {toPersianDigits(imageAuditSummary.skusWithVerifiedRealMarkingPhoto)} کد با مارکینگ واقعی)
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deliverables')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'deliverables'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>دانلود {toPersianDigits(data.deliverables.length)} فایل خروجی استاندارد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reassignments')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'reassignments'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>مخزن سراسری (GLOBAL_UNASSIGNED_BELT_SKUS) و بازتخصیص‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('images')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'images'
              ? 'bg-[#E06518] text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-[#E06518]'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>گزارش تصاویر ردشده، تکراری و منابع سازندگان</span>
        </button>
      </div>

      {/* TAB: INTERACTIVE LIVE MARKING CALIBRATION STUDIO */}
      {activeTab === 'studio' && (
        <BeltMarkingCalibrationStudio
          onCalibrationSaved={() => {
            setVisualAudit(null);
          }}
        />
      )}

      {/* TAB: VISUAL MARKING & GEOMETRY VALIDATION MODULE */}
      {activeTab === 'visual' && (
        <section className="space-y-6" data-testid="visual-validation-tab">
          {/* Live SKU / Family Visual Marking Inspector */}
          <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <ScanEye className="w-5 h-5 text-[#E06518]" />
                  <span>ماژول اعتبارسنجی بصری مارکینگ، برند، پروفیل و هندسه تسمه در برابر پایگاه داده</span>
                </h2>
                <p className="text-xs text-slate-600 leading-6 max-w-4xl">
                  این ماژول به‌صورت زنده تصویر نهایی هر کد کالا یا خانواده را با مشخصات ثبت‌شده در دیتابیس از نظر ۶ معیار دقیق پیکسلی و مهندسی بررسی می‌کند: تطابق برند (۰٪ نشت برند رقیب)، تطابق کد فنی و پروفیل، انطباق شکل فیزیکی تسمه با خانواده (کلاسیک، گوه‌ای، دنده‌ای، تایمینگ، چندشیار و…)، عدم هم‌پوشانی ۰٪ با لوگوی کارخانه، تمیزی بافت لاستیک (بدون کادر یا لکه) و نشست دقیق روی بدنه تسمه.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runLiveSkuValidation();
              }}
              className="flex flex-wrap items-center gap-2.5"
            >
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="visual-sku-input"
                  value={skuCheckInput}
                  onChange={(e) => setSkuCheckInput(e.target.value)}
                  placeholder="کد کالا (مثلاً 11226 یا 11259) یا کد خانواده (PFAM-...) را وارد کنید"
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono focus:outline-none focus:border-[#E06518]"
                  dir="ltr"
                />
              </div>
              <button
                type="submit"
                data-testid="visual-sku-submit"
                disabled={skuCheckLoading}
                className="px-5 py-2.5 rounded-xl bg-[#E06518] hover:bg-[#c55510] disabled:opacity-60 text-white text-xs sm:text-sm font-black transition-colors cursor-pointer"
              >
                {skuCheckLoading ? 'در حال بررسی پیکسلی...' : 'اعتبارسنجی زنده کد کالا'}
              </button>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500 font-bold">تست سریع:</span>
                {[
                  { label: 'SWR A-16 (11226)', code: '11226' },
                  { label: 'Optibelt-VB B', code: 'PFAM-تسمه-V-شکل-کلا-OPTIBELT-B-040' },
                  { label: 'Dongil A', code: 'PFAM-تسمه-V-شکل-کلا-DONGIL-A-016' },
                  { label: 'Marshal H Timing', code: 'PFAM-تسمه-تایمینگ-ذ-MARSHAL-H-002' },
                ].map((q) => (
                  <button
                    key={q.code}
                    type="button"
                    onClick={() => {
                      setSkuCheckInput(q.code);
                      void runLiveSkuValidation(q.code);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-[#E06518] text-slate-700 font-bold transition-colors cursor-pointer"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </form>

            {skuCheckError && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-bold text-rose-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{skuCheckError}</span>
              </div>
            )}

            {skuCheckReport && (
              <div
                data-testid="visual-sku-result"
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5"
              >
                <div className="lg:col-span-4 space-y-3">
                  <div className="rounded-2xl bg-white border border-slate-200 p-3 flex items-center justify-center min-h-[220px]">
                    <img
                      src={skuCheckReport.imagePublicPath}
                      alt={skuCheckReport.codePrinted}
                      className="max-h-[220px] w-auto object-contain"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                      <div className="text-slate-500">امتیاز اعتبارسنجی</div>
                      <div className="text-lg font-black text-emerald-600" dir="ltr">
                        {skuCheckReport.score} / 100
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                      <div className="text-slate-500">تداخل با لوگو</div>
                      <div className="text-lg font-black text-slate-900" dir="ltr">
                        {(skuCheckReport.logoOverlapIoU * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                      <div className="text-slate-500">اختلاف بافت مرزی</div>
                      <div className="text-sm font-black text-slate-900 font-mono" dir="ltr">
                        ΔRGB {skuCheckReport.seamDeltaRgb}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                      <div className="text-slate-500">نشست روی تسمه</div>
                      <div className="text-sm font-black text-slate-900 font-mono" dir="ltr">
                        {Math.round(skuCheckReport.beltLandingRatio * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-500">
                        مستر کالیبره‌شده: <span dir="ltr" className="font-mono text-slate-800">{skuCheckReport.masterId}</span> · مارکینگ چاپی:{' '}
                        <span dir="ltr" className="font-mono font-black text-[#E06518]">{skuCheckReport.codePrinted}</span>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black ${
                        skuCheckReport.verdict === 'PASS_VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : skuCheckReport.verdict === 'WARN_MINOR_ADJUST'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {skuCheckReport.verdict === 'PASS_VERIFIED'
                        ? 'تأیید کامل بصری و مهندسی'
                        : skuCheckReport.verdict === 'WARN_MINOR_ADJUST'
                          ? 'نیازمند تنظیم جزئی'
                          : 'رد شده'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {skuCheckReport.checks.map((ch) => (
                      <div
                        key={ch.key}
                        className={`rounded-xl border p-3 space-y-1 ${
                          ch.passed ? 'bg-white border-emerald-200/80' : 'bg-rose-50/70 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            {ch.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            )}
                            {ch.labelFa}
                          </span>
                          <span dir="ltr" className="text-[10px] font-mono font-bold text-slate-500 shrink-0">
                            {ch.metric}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-5">{ch.detailFa}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 25-Master Calibrated Real Photo Audit Matrix */}
          <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ممیزی جامع ۳۷ تصویر مستر واقعی کالیبره‌شده (۱۲ مستر برند اصلی + ۲۵ مستر ساختاری متنوع)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  کنترل پیکسلی هم‌زمانی تمام الگوهای ساختاری تسمه‌های صنعتی (کلاسیک، گوه‌ای، دنده‌ای، تایمینگ، دوطرفه، پلی‌یورتان، روکش‌دار، شیاری، شش‌ضلعی، گرد، تاج‌دار و نقاله)
                </p>
              </div>
              {visualAudit && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                    قبول کامل: {toPersianDigits(visualAudit.passedCount)} / {toPersianDigits(visualAudit.totalMasters)}
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800">
                    میانگین امتیاز: {toPersianDigits(visualAudit.averageScore)} / ۱۰۰
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-[#E06518]">
                    هم‌پوشانی لوگو: ۰٪
                  </span>
                </div>
              )}
            </div>

            {visualLoading && (
              <div className="py-10 text-center text-xs font-bold text-slate-500">
                در حال اجرای تحلیل پیکسلی و هندسی روی هر ۳۷ تصویر مستر واقعی...
              </div>
            )}

            {visualAudit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visualAudit.reports.map((rep) => (
                  <div
                    key={rep.masterId}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden flex flex-col"
                  >
                    <div className="bg-white h-40 p-3 flex items-center justify-center border-b border-slate-100">
                      <img
                        src={rep.imagePublicPath}
                        alt={rep.masterId}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span dir="ltr" className="text-xs font-mono font-black text-slate-900">
                            {rep.masterId}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              rep.verdict === 'PASS_VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {toPersianDigits(rep.score)}/۱۰۰
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 flex items-center justify-between">
                          <span>نمونه تست:</span>
                          <span dir="ltr" className="font-mono font-bold text-[#E06518]">
                            {rep.codePrinted}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-200/70 text-[10px] text-center">
                        <div className="rounded-lg bg-white p-1.5 border border-slate-100">
                          <div className="text-slate-400">تداخل لوگو</div>
                          <div className="font-mono font-black text-emerald-700" dir="ltr">
                            {(rep.logoOverlapIoU * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-white p-1.5 border border-slate-100">
                          <div className="text-slate-400">بافت ΔRGB</div>
                          <div className="font-mono font-black text-slate-800" dir="ltr">
                            {rep.seamDeltaRgb}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white p-1.5 border border-slate-100">
                          <div className="text-slate-400">نشست بدنه</div>
                          <div className="font-mono font-black text-slate-800" dir="ltr">
                            {Math.round(rep.beltLandingRatio * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 0: PHYSICAL MARKING VERIFICATION & ENGINEERING IMAGE STUDIO */}
      {activeTab === 'engineering' && (
        <section className="space-y-6" data-testid="engineering-marking-tab">
          {/* SWR A-49 Master -> A-16 / A-19 Reference Workflow Showcase */}
          <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>الگوی مرجع: تأیید مارکینگ فیزیکی SWR A-49 ← شفاف‌سازی پایه ← تطبیق جراحی کدهای A-16 و A-19</span>
                </h2>
                <p className="text-xs text-slate-600 leading-6 max-w-4xl">
                  بر اساس قوانین ممیزی فیزیکی: ابتدا تصویر واقعی تسمه با خواندن مستقیم مارکینگ چاپ‌شده روی بدنه (<bdi dir="ltr" className="font-mono font-bold text-slate-800">SWR® OIL-HEAT RESISTANT / STATIC DISSIPATING / A-49</bdi>) تأیید و شفاف‌سازی می‌شود؛ سپس موتور قضاوت مهندسی ۹عامل، سازگاری ساختاری هر کد عضو را بررسی کرده و در صورت یکسان بودن ۱۰۰٪ ساختار (برند، پروفیل، روکش کتان، جنس و فرم عرضه)، تنها کد سایز چاپی روی بدنه را بدون تغییر در هندسه یا بافت تسمه منطبق می‌سازد.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/api/belt-audit/deliverables/engineering_marking_audit.csv?download=1"
                  download="engineering_marking_audit.csv"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E06518] hover:bg-[#c55510] text-white text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود گزارش مهندسی کامل (CSV)</span>
                </a>
                <a
                  href="/api/belt-audit/deliverables/engineering_marking_audit.json?download=1"
                  download="engineering_marking_audit.json"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-400 text-slate-700 text-xs font-bold transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>خروجی JSON</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  step: '۱. مرجع خام واقعی',
                  title: 'تصویر واقعی مرجع (SWR A-49)',
                  marking: 'SWR® A-49 (Raw Reference)',
                  img: '/assets/aistudio/photo_31459709079_x__1__e6c5f272.jpg',
                  skuLink: '/products/PFAM-%D8%AA%D8%B3%D9%85%D9%87-V-%D8%B4%DA%A9%D9%84-%DA%A9%D9%84%D8%A7-SWR-A-011?sku=11259',
                  note: 'تأیید برند SWR، پروفیل کلاسیک A و روکش کتان مقاوم در برابر روغن و حرارت',
                },
                {
                  step: '۲. پایه شفاف‌سازی‌شده',
                  title: 'کد 11259 — SWR A-49 (Master)',
                  marking: 'SWR® OIL-HEAT RESISTANT · A-49',
                  img: '/src/assets/catalog/belts/skus/11259/real-product-image.webp',
                  skuLink: '/products/PFAM-%D8%AA%D8%B3%D9%85%D9%87-V-%D8%B4%DA%A9%D9%84-%DA%A9%D9%84%D8%A7-SWR-A-011?sku=11259',
                  note: 'بازسازی شفافیت چاپ بدنه بدون حذف بافت واقعی و بدون هیچ واترمارک',
                },
                {
                  step: '۳. تطبیق جراحی کد عضو',
                  title: 'کد 11226 — SWR A-16 (Adapted)',
                  marking: 'SWR® OIL-HEAT RESISTANT · A-16',
                  img: '/src/assets/catalog/belts/skus/11226/real-product-image.webp',
                  skuLink: '/products/PFAM-%D8%AA%D8%B3%D9%85%D9%87-V-%D8%B4%DA%A9%D9%84-%DA%A9%D9%84%D8%A7-SWR-A-011?sku=11226',
                  note: 'ساختار ۱۰۰٪ یکسان (DIN 2215 / 13×406 Li) ← جایگزینی دقیق کد A-49 به A-16',
                },
                {
                  step: '۴. تطبیق جراحی کد عضو',
                  title: 'کد 11229 — SWR A-19 (Adapted)',
                  marking: 'SWR® OIL-HEAT RESISTANT · A-19',
                  img: '/src/assets/catalog/belts/skus/11229/real-product-image.webp',
                  skuLink: '/products/PFAM-%D8%AA%D8%B3%D9%85%D9%87-V-%D8%B4%DA%A9%D9%84-%DA%A9%D9%84%D8%A7-SWR-A-011?sku=11229',
                  note: 'ساختار ۱۰۰٪ یکسان (DIN 2215 / 13×480 Li) ← جایگزینی دقیق کد A-49 به A-19',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-[#FAF8F5] overflow-hidden flex flex-col"
                >
                  <div className="aspect-[4/3] bg-white p-3 flex items-center justify-center border-b border-slate-100">
                    <img
                      src={card.img}
                      alt={card.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="p-3.5 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-[10.5px] font-bold text-[#E06518]">{card.step}</div>
                      <div className="text-xs font-black text-slate-900">{card.title}</div>
                      <div className="font-mono text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200/70 rounded px-2 py-0.5 truncate" dir="ltr">
                        {card.marking}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-5">{card.note}</p>
                    </div>
                    <Link
                      to={card.skuLink}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E06518] hover:underline pt-1"
                    >
                      <span>مشاهده صفحه زنده محصول</span>
                      <ArrowLeft className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Aggregate 0-to-100 Cleanup Metrics */}
            {engReport?.totals && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">جایگاه‌های واترمارک پاکسازی‌شده</div>
                  <div className="text-lg font-black text-rose-600 tabular-nums">
                    {toPersianDigits((engReport.totals.purgedWatermarkedFamilySlots || 0).toLocaleString('en-US'))}
                  </div>
                  <div className="text-[10px] text-slate-500">B2B / IndiaMART / Made-in-China</div>
                </div>
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">کل کدهای ممیزی‌شده</div>
                  <div className="text-lg font-black text-slate-900 tabular-nums">
                    {toPersianDigits((engReport.totals.totalAuditedSkus || 0).toLocaleString('en-US'))}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold">پوشش ۱۰۰٪ بدون کد خالی</div>
                </div>
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">تطبیق جراحی کد روی بدنه</div>
                  <div className="text-lg font-black text-[#E06518] tabular-nums">
                    {toPersianDigits((engReport.totals.masterEnhancedAdaptedSkus || 0).toLocaleString('en-US'))}
                  </div>
                  <div className="text-[10px] text-slate-500">شامل کل SWR پروفیل A</div>
                </div>
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">اختلاف ساختار شناسایی‌شده</div>
                  <div className="text-lg font-black text-amber-600 tabular-nums">
                    {toPersianDigits((engReport.totals.incompatibleStructureDetected || 0).toLocaleString('en-US'))}
                  </div>
                  <div className="text-[10px] text-slate-500">رد خودکار پایه ناسازگار</div>
                </div>
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">خانواده‌های بدون تصویر</div>
                  <div className="text-lg font-black text-emerald-700 tabular-nums">
                    {toPersianDigits(engReport.totals.zeroEmptyFamilies ?? 0)}
                  </div>
                  <div className="text-[10px] text-emerald-700">از ۱,۰۸۸ خانواده</div>
                </div>
                <div className="rounded-2xl bg-[#FAF8F5] border border-slate-200 p-3">
                  <div className="text-[10.5px] text-slate-500">کدهای کالای بدون تصویر</div>
                  <div className="text-lg font-black text-emerald-700 tabular-nums">
                    {toPersianDigits(engReport.totals.zeroEmptySkus ?? 0)}
                  </div>
                  <div className="text-[10px] text-emerald-700">تضمین ۰ کد خالی</div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive 7-Field Internal Provenance & Engineering Judgment Table */}
          <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  جدول کامل ممیزی داخلی ۷فیلدی (منبع اصلی، مارکینگ خوانده‌شده، رأی مهندسی و تصویر نهایی)
                </h3>
                <p className="text-xs text-slate-500">
                  دامنه‌ها و لینک‌های مرجع صرفاً در این داشبورد داخلی ممیزی نمایش داده می‌شوند و در صفحات عمومی مشتریان پنهان هستند.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={engQuery}
                    onChange={(e) => {
                      setEngQuery(e.target.value);
                      setEngOffset(0);
                    }}
                    placeholder="جستجوی کد، برند، پروفیل (مثلاً 11226 یا SWR)..."
                    className="rounded-xl border border-slate-200 bg-slate-50 pr-8 pl-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#E06518] w-64"
                  />
                </div>
                <select
                  value={engVerdict}
                  onChange={(e) => {
                    setEngVerdict(e.target.value);
                    setEngOffset(0);
                  }}
                  aria-label="فیلتر رأی مهندسی"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <option value="ALL">همه آرای مهندسی</option>
                  <option value="COMPATIBLE_EXACT_MASTER">تطابق دقیق با پایه</option>
                  <option value="COMPATIBLE_MARKING_ADAPTABLE">قابل تطبیق مارکینگ</option>
                  <option value="INCOMPATIBLE_STRUCTURE">ساختار ناسازگار (رد پایه)</option>
                  <option value="INCOMPATIBLE_BRAND">برند ناسازگار</option>
                </select>
                <select
                  value={engClass}
                  onChange={(e) => {
                    setEngClass(e.target.value);
                    setEngOffset(0);
                  }}
                  aria-label="فیلتر نوع تصویر نهایی"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <option value="ALL">همه انواع تصویر</option>
                  <option value="EXACT_PHYSICAL_MARKING">مارکینگ اصلی تأییدشده</option>
                  <option value="MASTER_ENHANCED_MARKING_ADAPTED">تطبیق‌یافته از تصویر پایه</option>
                  <option value="DEDICATED_REAL_WEB_PHOTO">عکس اختصاصی وب تصفیه‌شده</option>
                  <option value="FAMILY_VERIFIED_REAL_PHOTO">تصویر تأییدشده خانواده</option>
                </select>
              </div>
            </div>

            {engLoading ? (
              <div className="py-10 text-center text-xs text-slate-500">در حال بارگذاری رکوردهای ممیزی...</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="py-2.5 px-3 font-black">کد کالا</th>
                        <th className="py-2.5 px-3 font-black">برند / پروفیل / کد بدنه</th>
                        <th className="py-2.5 px-3 font-black">تصویر نهایی</th>
                        <th className="py-2.5 px-3 font-black">مارکینگ خوانده‌شده مرجع</th>
                        <th className="py-2.5 px-3 font-black">رأی قضاوت مهندسی</th>
                        <th className="py-2.5 px-3 font-black">توضیح مهندسی و منبع داخلی</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {(engReport?.items || []).map((rec) => (
                        <tr key={rec.skuCode} className="hover:bg-slate-50/80 align-top">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#E06518] tabular-nums" dir="ltr">
                            <Link
                              to={`/products/${encodeURIComponent(rec.familyCode)}?sku=${encodeURIComponent(rec.skuCode)}`}
                              className="hover:underline"
                            >
                              {rec.skuCode}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono font-bold text-slate-900" dir="ltr">
                              {rec.brand} · {rec.profile} · {rec.targetMarkingCode}
                            </div>
                            <div className="text-[10.5px] text-slate-500 mt-0.5">{rec.standardReference}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="w-16 h-12 rounded-lg border border-slate-200 bg-white p-1 flex items-center justify-center overflow-hidden">
                              {rec.finalImagePath && (
                                <img
                                  src={rec.finalImagePath}
                                  alt={rec.skuCode}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-contain"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[200px]">
                            <div className="font-mono text-[10.5px] text-slate-800 break-words" dir="ltr">
                              {rec.masterReadMarking}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{rec.constructionFa}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                rec.engineeringVerdict === 'COMPATIBLE_EXACT_MASTER'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : rec.engineeringVerdict === 'COMPATIBLE_MARKING_ADAPTABLE'
                                    ? 'bg-orange-100 text-orange-900'
                                    : 'bg-rose-100 text-rose-900'
                              }`}
                              dir="ltr"
                            >
                              {rec.engineeringVerdict}
                            </span>
                            <div className="font-mono text-[9.5px] text-slate-500 mt-1" dir="ltr">
                              {rec.finalImageClassification}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs space-y-1">
                            <p className="text-[11px] text-slate-700 leading-5">{rec.reasonFa}</p>
                            {rec.masterSourceUrl && /^https?:\/\//i.test(rec.masterSourceUrl) && (
                              <a
                                href={rec.masterSourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-[#E06518]"
                                dir="ltr"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate max-w-[220px]">{rec.masterSourceUrl}</span>
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {engReport && engReport.totalMatched > engReport.limit && (
                  <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                    <span>
                      نمایش {toPersianDigits(engOffset + 1)} تا{' '}
                      {toPersianDigits(Math.min(engOffset + engReport.limit, engReport.totalMatched))} از{' '}
                      {toPersianDigits(engReport.totalMatched.toLocaleString('en-US'))} رکورد
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={engOffset === 0}
                        onClick={() => setEngOffset(Math.max(0, engOffset - engReport.limit))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 font-bold hover:border-[#E06518] cursor-pointer"
                      >
                        صفحه قبل
                      </button>
                      <button
                        type="button"
                        disabled={engOffset + engReport.limit >= engReport.totalMatched}
                        onClick={() => setEngOffset(engOffset + engReport.limit)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 font-bold hover:border-[#E06518] cursor-pointer"
                      >
                        صفحه بعد
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* TAB 1: PILOT SHOWCASE */}
      {activeTab === 'pilot' && (
        <section className="space-y-6">
          <div className="rounded-2xl bg-orange-50/70 border border-orange-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-black text-slate-800">
                پایلوت اجرایی {toPersianDigits(data.pilotShowcase.length)} خانواده منتخب با ۴ تصویر واقعی و{' '}
                {toPersianDigits(imageAuditSummary.skusWithVerifiedRealMarkingPhoto)} کد کالای تاییدشده با مارکینگ فیزیکی روی تسمه
              </h2>
              <p className="text-xs text-slate-600">
                شامل تطبیق کامل شناسه مبدا (<bdi dir="ltr" className="font-mono">FAM-*</bdi>)، شناسه مهندسی ممیزی (<bdi dir="ltr" className="font-mono">FAM-*</bdi>) و شناسه اجرایی کاتالوگ (<bdi dir="ltr" className="font-mono">PFAM-*</bdi>)، به همراه ۴ تصویر واقعی اختصاصی لوکال (<bdi dir="ltr" className="font-mono">.webp</bdi>)، جدول مشخصات مهندسی، عکس مارکینگ واقعی روی تسمه و نقشه‌های فنی CAD.
              </p>
            </div>
          </div>

          {data.pilotShowcase.map((fam) => (
            <article
              key={fam.sourceFamilyId}
              className="rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden space-y-5 p-5 sm:p-6"
            >
              {/* Family Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#E06518] text-white text-xs font-black">
                      خانواده پایلوت #{toPersianDigits(fam.pilotOrder)}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-mono font-bold"
                      dir="ltr"
                    >
                      Source: {fam.sourceFamilyId}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-mono font-bold"
                      dir="ltr"
                    >
                      Audit: {fam.proposedFamilyId}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-mono font-bold"
                      dir="ltr"
                    >
                      Runtime: {fam.runtimePfamId}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">{fam.titleFa}</h3>
                  <p className="text-xs font-mono text-slate-500" dir="ltr">
                    {fam.titleEn} | Standard: {fam.standardReference}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/products/${encodeURIComponent(fam.runtimePfamId)}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E06518] hover:bg-[#c55510] text-white text-xs font-bold transition-colors"
                  >
                    <span>مشاهده صفحه زنده خانواده در سایت</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Link>
                  <a
                    href={fam.manufacturerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-400 text-slate-700 text-xs font-bold transition-colors"
                  >
                    <span>مرجع رسمی سازنده ({fam.brand})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Engineering Identity Specs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70 text-xs">
                <div>
                  <span className="text-slate-500">پروفیل و ساختار: </span>
                  <strong className="font-mono text-slate-900" dir="ltr">
                    {fam.profile} ({fam.beltDivision})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">فرم عرضه: </span>
                  <strong className="text-slate-900">{fam.supplyForm}</strong>
                </div>
                <div>
                  <span className="text-slate-500">جنس بدنه: </span>
                  <strong className="text-slate-900">{fam.bodyMaterial}</strong>
                </div>
                <div>
                  <span className="text-slate-500">کورد کششی: </span>
                  <strong className="text-slate-900">{fam.tensileCord}</strong>
                </div>
              </div>

              {/* 4 Real Family Photo Slots + Companion Engineering Spec Sheet */}
              <div className="space-y-3">
                <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[#E06518]" />
                  <span>
                    وضعیت ۴ تصویر واقعی خانواده (<bdi dir="ltr" className="font-mono">{fam.runtimePfamId}</bdi>)
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {fam.familySlots.map((slot) => (
                    <div
                      key={slot.slotNumber}
                      className={`rounded-2xl border overflow-hidden flex flex-col ${
                        slot.url
                          ? 'border-emerald-200 bg-white'
                          : 'border-dashed border-slate-300 bg-slate-50/70'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-slate-50 p-3 flex items-center justify-center border-b border-slate-100 relative">
                        {slot.url ? (
                          <img
                            src={slot.url}
                            alt={slot.slotName}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center space-y-1.5 px-2">
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-bold">
                              NOT_FOUND
                            </span>
                            <p className="text-[11px] font-bold text-slate-600">جایگاه خالی طبق قانون ۵</p>
                          </div>
                        )}
                        <span
                          className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[9.5px] font-mono font-bold ${
                            slot.url ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                          dir="ltr"
                        >
                          {slot.slotName}
                        </span>
                      </div>
                      <div className="p-3 space-y-1 text-[11px] flex-1 flex flex-col justify-between">
                        <p className="text-slate-700 font-medium leading-4">{slot.noteFa}</p>
                        {slot.sourcePageUrl && (
                          <a
                            href={slot.sourcePageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#E06518] font-bold hover:underline pt-1"
                          >
                            <span>لینک صفحه منبع تصویر</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Companion Engineering Spec Sheet */}
                <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-3 flex flex-col sm:flex-row items-center gap-3.5 justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-16 rounded-xl bg-white border border-indigo-100 p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src={fam.specSheetUrl}
                        alt="family-specifications"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">جدول مشخصات مهندسی و بازه ابعادی خانواده</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-900 text-white text-[9.5px] font-mono font-bold" dir="ltr">
                          VERIFIED_ENGINEERING_REDRAW
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        تولیدشده از استاندارد مرجع و ابعاد واقعی کدهای عضو خانواده (<bdi dir="ltr" className="font-mono">family-specifications.svg</bdi>)
                      </p>
                    </div>
                  </div>
                  <a
                    href={fam.specSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-800 text-xs font-bold shrink-0 transition-colors"
                  >
                    <span>مشاهده جدول با کیفیت اصلی</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Sample Member SKUs */}
              <div className="space-y-2.5">
                <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-[#E06518]" />
                  <span>کدهای کالای منتخب این خانواده در پایلوت (بررسی ۲ جایگاه تصویر هر SKU)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fam.sampleSkus.map((sku) => (
                    <div
                      key={sku.sku}
                      className="rounded-2xl border border-slate-200 bg-[#FAF8F5] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-bold"
                              dir="ltr"
                            >
                              SKU {sku.sku}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                sku.auditStatus === 'CORRECT_FAMILY'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                              dir="ltr"
                            >
                              {sku.auditStatus}
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-800 mt-1">{sku.rawTitle}</div>
                        </div>
                        <Link
                          to={`/products/${encodeURIComponent(sku.runtimePfamId)}?sku=${encodeURIComponent(sku.sku)}`}
                          className="text-[11px] font-bold text-[#E06518] hover:underline"
                        >
                          باز کردن در صفحه محصول ←
                        </Link>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* SKU Slot 1: Real Marking Photo */}
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5 flex flex-col">
                          <div className="text-[10.5px] font-black text-slate-700 flex items-center justify-between">
                            <span>۰۱: عکس واقعی مارکینگ</span>
                            <span
                              className={`font-mono text-[9.5px] px-1.5 py-0.5 rounded ${
                                sku.realMarkingPhoto.url
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                              dir="ltr"
                            >
                              {sku.realMarkingPhoto.status}
                            </span>
                          </div>
                          <div className="aspect-[16/10] bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center p-1.5">
                            {sku.realMarkingPhoto.url ? (
                              <img
                                src={sku.realMarkingPhoto.url}
                                alt={`SKU ${sku.sku}`}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <span className="text-[10.5px] text-slate-500 text-center px-2">
                                جایگاه خالی (NOT_FOUND — بدون جایگزینی عکس سایز دیگر)
                              </span>
                            )}
                          </div>
                          {sku.realMarkingPhoto.visibleMarking && (
                            <div
                              className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-1 rounded truncate"
                              dir="ltr"
                            >
                              Marking: {sku.realMarkingPhoto.visibleMarking}
                            </div>
                          )}
                          {sku.realMarkingPhoto.sourcePageUrl && (
                            <a
                              href={sku.realMarkingPhoto.sourcePageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-[#E06518] font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <span>مشاهده منبع اصلی عکس</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {/* SKU Slot 2: Technical Drawing */}
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5 flex flex-col">
                          <div className="text-[10.5px] font-black text-slate-700 flex items-center justify-between">
                            <span>۰۲: نقشه فنی ابعاد</span>
                            <span
                              className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900"
                              dir="ltr"
                            >
                              CAD_REDRAW
                            </span>
                          </div>
                          <a
                            href={sku.technicalDrawingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="aspect-[16/10] bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center p-1.5 hover:opacity-90"
                          >
                            <img
                              src={sku.profileDrawingUrl}
                              alt={`Drawing ${sku.sku}`}
                              className="w-full h-full object-contain"
                            />
                          </a>
                          <div className="text-[10px] font-mono text-slate-600 truncate" dir="ltr">
                            Profile: {sku.profile} | W: {sku.widthMm ?? '-'}mm | Lp/Li:{' '}
                            {sku.pitchLengthMm ?? sku.insideLengthMm ?? '-'}mm
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* TAB 2: 17 MANDATORY DELIVERABLES */}
      {activeTab === 'deliverables' && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              فهرست کامل ۱۷ فایل خروجی الزامی (بخش چهاردهم دستور مادر)
            </h2>
            <p className="text-xs text-slate-600">
              تمام فایل‌ها بر اساس آخرین وضعیت ممیزی مهندسی و تصفیه یک‌به‌یک تصاویر تولید شده‌اند و به‌صورت مستقیم قابل دانلود یا مشاهده هستند.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-3 px-3 font-black">ردیف</th>
                  <th className="py-3 px-3 font-black">نام فایل استاندارد</th>
                  <th className="py-3 px-3 font-black">تعداد رکورد</th>
                  <th className="py-3 px-3 font-black">شرح مهندسی محتوا</th>
                  <th className="py-3 px-3 font-black text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {data.deliverables.map((item) => (
                  <tr key={item.filename} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-bold text-slate-700">{toPersianDigits(item.id)}</td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900" dir="ltr">
                      {item.filename}
                    </td>
                    <td className="py-3 px-3 font-bold text-[#E06518]">
                      {toPersianDigits(item.rows.toLocaleString('en-US'))}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{item.descriptionFa}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <a
                          href={`/api/belt-audit/deliverables/${encodeURIComponent(item.filename)}?download=1`}
                          download={item.filename}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E06518] hover:bg-[#c55510] text-white font-bold transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>دانلود</span>
                        </a>
                        <a
                          href={`/api/belt-audit/deliverables/${encodeURIComponent(item.filename)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-400 text-slate-700 font-bold transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>مشاهده</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: GLOBAL UNASSIGNED BELT SKUS & REASSIGNMENTS */}
      {activeTab === 'reassignments' && (
        <section className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  مخزن مرکزی کدهای نیازمند تخصیص (GLOBAL_UNASSIGNED_BELT_SKUS) و جدول بازتخصیص سراسری
                </h2>
                <p className="text-xs text-slate-600">
                  نمایش نمونه از {toPersianDigits(data.reconciliation.globalUnassignedPoolTotal.toLocaleString('en-US'))} کد کالایی که در خانواده مبدا اشتباه قرار داشتند و پس از تطبیق سراسری پروفیل، برند و فرم عرضه به خانواده مهندسی واقعی خود منتقل شدند.
                </p>
              </div>
              <a
                href="/api/belt-audit/deliverables/global_unassigned_belt_skus.csv?download=1"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E06518] text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود کامل فایل مخزن بازتخصیص (CSV)</span>
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-black">کد کالا</th>
                    <th className="py-2.5 px-3 font-black">عنوان کالا در انبار</th>
                    <th className="py-2.5 px-3 font-black">خانواده مبدا (اشتباه)</th>
                    <th className="py-2.5 px-3 font-black">پروفیل / برند استخراج‌شده</th>
                    <th className="py-2.5 px-3 font-black">خانواده مهندسی مقصد (تصحیح‌شده)</th>
                    <th className="py-2.5 px-3 font-black">علت مهندسی جابه‌جایی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {data.sampleGlobalUnassigned.map((row) => (
                    <tr key={row.sku_id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#E06518]" dir="ltr">
                        {row.sku_id}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{row.raw_title}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-[11px] text-rose-700" dir="ltr">
                          {row.original_family_id}
                        </div>
                        <div className="text-[11px] text-slate-500">{row.original_family_name}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800" dir="ltr">
                        {row.extracted_profile} | {row.extracted_brand}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-[11px] text-emerald-800 font-bold" dir="ltr">
                          {row.final_assigned_family}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                          {row.final_runtime_pfam_id}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs">{row.mismatch_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: REJECTED & DUPLICATE IMAGES + MANUFACTURER SOURCES */}
      {activeTab === 'images' && (
        <section className="space-y-6">
          {/* Rejected Wrong Product Images */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>نمونه تصاویر ردشده به علت عدم تطابق محصول یا برند (rejected_images.csv)</span>
                </h2>
                <p className="text-xs text-slate-600">
                  شامل ۲۱ تصویر کاتالوگ <bdi dir="ltr" className="font-mono">e(...).png</bdi> (مربوط به پولی، قطعه تفلونی، براکت و دیافراگم) که در دیتابیس قبلی اشتباهاً به خانواده‌های تسمه متصل شده بودند + تصاویر دندانه دوطرفه روی خانواده‌های یک‌طرفه.
                </p>
              </div>
              <a
                href="/api/belt-audit/deliverables/rejected_images.csv?download=1"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود کامل rejected_images.csv ({toPersianDigits(imageAuditSummary.rejectedCandidateImagesCount)} مورد)</span>
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-black">نوع موجودیت</th>
                    <th className="py-2.5 px-3 font-black">شناسه خانواده / تصویر</th>
                    <th className="py-2.5 px-3 font-black">آدرس تصویر ردشده</th>
                    <th className="py-2.5 px-3 font-black">کد وضعیت</th>
                    <th className="py-2.5 px-3 font-black">علت مهندسی رد تصویر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {data.sampleRejectedImages.map((row, idx) => (
                    <tr key={`${row.entity_id}-${idx}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-[11px]" dir="ltr">
                        {row.entity_type}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900" dir="ltr">
                        {row.entity_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 truncate max-w-xs" dir="ltr">
                        {row.candidate_url}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-mono text-[10px] font-bold">
                          {row.rejection_status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{row.rejection_reason_fa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Official Manufacturer Sources */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              بانک منابع رسمی سازندگان بین‌المللی تسمه (<bdi dir="ltr" className="font-mono">manufacturer_sources.json</bdi>)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.manufacturerSources.map((m) => (
                <div key={m.brandCode} className="rounded-2xl border border-slate-200 p-4 space-y-2 bg-slate-50/60">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-bold">
                      {m.brandCode}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{m.manufacturerName}</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-600 list-disc pr-4">
                    {m.verifiedSeriesInCatalog.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
export default BeltMasterAuditPage;
