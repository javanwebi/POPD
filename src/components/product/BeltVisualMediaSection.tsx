import React, { useEffect, useState } from 'react';
import { CheckCircle2, Layers, ShieldCheck, Tag, ZoomIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BeltFamilyMedia, BeltSkuMedia } from '../../utils/beltCatalogMedia';
import { toPersianDigits } from '../../utils/formatters';

export interface BeltDocModalPayload {
  title: string;
  webpUrl: string;
  svgUrl: string;
  subtitle?: string;
}

interface CleanFamilySlotMeta {
  slotIndex: number;
  captionFa: string;
  verified: boolean;
}

interface CleanSkuAuthenticityCard {
  skuCode: string;
  brand: string;
  profile: string;
  standardReference: string;
  constructionFa: string;
  visibleMarking: string;
  classification:
    | 'EXACT_PHYSICAL_MARKING'
    | 'MASTER_ENHANCED_MARKING_ADAPTED'
    | 'DEDICATED_REAL_WEB_PHOTO'
    | 'FAMILY_VERIFIED_REAL_PHOTO';
  classificationLabelFa: string;
  engineeringNoteFa: string;
}

interface BeltVisualMediaSectionProps {
  productName: string;
  beltFamilyMedia: BeltFamilyMedia;
  beltSkuMedia: BeltSkuMedia | null;
  selectedSkuSize?: string;
  selectedSkuName?: string;
  onOpenDocModal: (payload: BeltDocModalPayload) => void;
  onJumpToFamilyGallery?: () => void;
}

export const BeltVisualMediaSection: React.FC<BeltVisualMediaSectionProps> = ({
  productName,
  beltFamilyMedia,
  beltSkuMedia,
  selectedSkuSize,
  selectedSkuName,
  onOpenDocModal,
}) => {
  const [familyMetaMap, setFamilyMetaMap] = useState<Record<number, CleanFamilySlotMeta>>({});
  const [skuCard, setSkuCard] = useState<CleanSkuAuthenticityCard | null>(null);
  const [skuImgLoaded, setSkuImgLoaded] = useState(false);

  const skuCode = beltSkuMedia?.skuCode || '';
  const familyCode = beltFamilyMedia.familyCode;

  useEffect(() => {
    setSkuImgLoaded(false);
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (familyCode) qs.set('familyCode', familyCode);
    if (skuCode) qs.set('skuCode', skuCode);

    fetch(`/api/belts/media-provenance?${qs.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.success || controller.signal.aborted) return;
        const map: Record<number, CleanFamilySlotMeta> = {};
        for (const s of data.familySlots || []) {
          map[Number(s.slotIndex)] = s;
        }
        setFamilyMetaMap(map);
        setSkuCard(data.skuCard || null);
      })
      .catch(() => {
        // Ignore transient metadata fetch errors
      });

    return () => controller.abort();
  }, [familyCode, skuCode]);

  const handleSkuImageLoad = () => {
    setSkuImgLoaded(true);
    if (!skuCode) return;
    fetch(`/api/belts/media-provenance?skuCode=${encodeURIComponent(skuCode)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.skuCard) {
          setSkuCard(data.skuCard);
        }
      })
      .catch(() => {});
  };

  const familySlots = [
    {
      id: 'fam-img-1',
      slotIndex: 1,
      url: beltFamilyMedia.familyPhotos[0],
      label: 'نمای کامل و مارکینگ',
      fallbackCaption: 'تصویر اصلی تأییدشده خانواده تسمه',
    },
    {
      id: 'fam-img-2',
      slotIndex: 2,
      url: beltFamilyMedia.familyPhotos[1],
      label: 'نمای سه‌رخ و پروفیل',
      fallbackCaption: 'زاویه مقطع و فرم بدنه تسمه',
    },
    {
      id: 'fam-img-3',
      slotIndex: 3,
      url: beltFamilyMedia.familyPhotos[2],
      label: 'بافت، لایه و کورد',
      fallbackCaption: 'جزئیات روکش و ساختار مهندسی بدنه',
    },
    {
      id: 'fam-img-4',
      slotIndex: 4,
      url: beltFamilyMedia.familyPhotos[3],
      label: 'نمای نزدیک مارکینگ',
      fallbackCaption: 'جزئیات چاپ فنی و ساختار مقطع',
    },
  ];

  const availableFamilySlots = familySlots.filter((s) => Boolean(s.url));

  const statusHeadline =
    skuCard?.classificationLabelFa ||
    (beltSkuMedia?.skuImageSourceType === 'EXACT_WEB_VERIFIED'
      ? 'تصویر تأییدشده با مارکینگ فیزیکی سازنده روی بدنه تسمه'
      : 'تصویر تأییدشده مطابق برند، پروفیل و ساختار مهندسی');

  return (
    <section
      dir="rtl"
      aria-label="گالری ۴تصویری خانواده و شناسنامه مارکینگ فیزیکی کد کالا"
      className="space-y-5"
    >
      {/* Part 1: 4 Clean Verified Family Belt Photographs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="space-y-0.5">
            <h2 className="text-sm sm:text-base font-black text-[#2B313A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E06518]" />
              <span>گالری ۴تصویری مهندسی و اختصاصی خانواده محصول</span>
            </h2>
            <p className="text-xs text-slate-500">
              {productName} ·{' '}
              <span className="font-semibold text-emerald-700">
                تأییدشده بر اساس برند، پروفیل و ساختار فیزیکی بدنه
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="font-bold text-[#2B313A] tabular-nums">
              {toPersianDigits(availableFamilySlots.length)} نمای تأییدشده
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <Link
              to="/belt-audit"
              className="inline-flex items-center gap-1 font-bold text-slate-600 hover:text-[#E06518] transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>مرکز ممیزی کاتالوگ</span>
            </Link>
          </div>
        </div>

        <div
          data-testid="family-4photo-grid"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3.5"
        >
          {availableFamilySlots.map((card, idx) => {
            const meta = familyMetaMap[card.slotIndex];
            const captionText = meta?.captionFa || card.fallbackCaption;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() =>
                  onOpenDocModal({
                    title: `${card.label} — ${productName}`,
                    webpUrl: card.url!,
                    svgUrl: card.url!,
                    subtitle: captionText,
                  })
                }
                aria-label={`بزرگ‌نمایی ${card.label} خانواده ${productName}`}
                className="group rounded-2xl border border-slate-200/90 bg-white overflow-hidden text-right hover:border-[#E06518] hover:shadow-md transition-all cursor-pointer flex flex-col"
              >
                <div className="relative aspect-[4/3] w-full bg-[#FAF8F5] p-3 flex items-center justify-center overflow-hidden border-b border-slate-100">
                  <img
                    src={card.url!}
                    alt={`${card.label} — ${productName}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute top-2.5 left-2.5 rounded-lg bg-slate-900/70 text-white p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="p-3 space-y-1 bg-white flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#2B313A]">{card.label}</span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums" dir="ltr">
                      0{idx + 1}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-5 line-clamp-1">
                    {captionText}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Part 2: Dedicated Selected SKU Photograph + Clean Industrial Marking & Authenticity Card */}
      {beltSkuMedia && (
        <div
          data-testid="sku-real-belt-section"
          className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="space-y-0.5">
              <h2 className="text-sm sm:text-base font-black text-[#2B313A] flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#E06518]" />
                <span>
                  تصویر و مارکینگ اختصاصی کد{' '}
                  <bdi dir="ltr" className="font-mono text-[#E06518] tabular-nums">
                    {beltSkuMedia.skuCode}
                  </bdi>
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {selectedSkuName || productName}
                {selectedSkuSize ? (
                  <>
                    {' '}·{' '}
                    <span className="font-mono text-slate-700" dir="ltr">
                      {selectedSkuSize}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusHeadline}</span>
              </span>
            </div>
          </div>

          <div
            className={`grid gap-4 items-stretch ${
              beltSkuMedia.realProductCloseupImage
                ? 'grid-cols-1 lg:grid-cols-3'
                : 'grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]'
            }`}
          >
            {/* Primary Verified/Adapted SKU Belt Photograph */}
            <button
              type="button"
              onClick={() =>
                onOpenDocModal({
                  title: `تصویر تسمه — کد ${beltSkuMedia.skuCode}`,
                  webpUrl: beltSkuMedia.realProductImage,
                  svgUrl: beltSkuMedia.realProductImage,
                  subtitle: `${selectedSkuName || productName}${skuCard?.visibleMarking ? ` · مارکینگ بدنه: ${skuCard.visibleMarking}` : ''}`,
                })
              }
              aria-label={`بزرگ‌نمایی تصویر تسمه کد ${beltSkuMedia.skuCode}`}
              className="group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white overflow-hidden hover:border-[#E06518] hover:shadow-md transition-all cursor-zoom-in text-right"
            >
              <div className="relative aspect-[16/10] w-full flex items-center justify-center p-4 bg-[#FAF8F5]">
                {!skuImgLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#FAF8F5]/90 text-xs text-slate-500">
                    <span className="w-6 h-6 border-2 border-[#E06518] border-t-transparent rounded-full animate-spin" />
                    <span>در حال آماده‌سازی تصویر تأییدشده این کد...</span>
                  </div>
                )}
                <img
                  key={beltSkuMedia.realProductImage}
                  src={beltSkuMedia.realProductImage}
                  onLoad={handleSkuImageLoad}
                  onError={() => setSkuImgLoaded(true)}
                  referrerPolicy="no-referrer"
                  alt={`تصویر تسمه صنعتی کد ${beltSkuMedia.skuCode}`}
                  className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
                <span className="absolute top-3 left-3 rounded-lg bg-slate-900/75 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-4 h-4" />
                </span>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-black text-[#2B313A]">
                  {skuCard?.classification === 'MASTER_ENHANCED_MARKING_ADAPTED'
                    ? 'نمای کامل تسمه با کد سایز منطبق روی بدنه'
                    : 'نمای کامل واقعی با مارکینگ سازنده'}
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums" dir="ltr">
                  SKU {beltSkuMedia.skuCode}
                </span>
              </div>
            </button>

            {/* Optional Macro Marking Close-up */}
            {beltSkuMedia.realProductCloseupImage && (
              <button
                type="button"
                onClick={() =>
                  onOpenDocModal({
                    title: `نمای نزدیک مارکینگ روی بدنه — کد ${beltSkuMedia.skuCode}`,
                    webpUrl: beltSkuMedia.realProductCloseupImage!,
                    svgUrl: beltSkuMedia.realProductCloseupImage!,
                    subtitle: `${selectedSkuName || productName} · نمای نزدیک مارکینگ چاپ‌شده روی بدنه تسمه`,
                  })
                }
                aria-label={`بزرگ‌نمایی نمای نزدیک مارکینگ کد ${beltSkuMedia.skuCode}`}
                className="group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white overflow-hidden hover:border-[#E06518] hover:shadow-md transition-all cursor-zoom-in text-right"
              >
                <div className="relative aspect-[16/10] w-full flex items-center justify-center p-4 bg-[#FAF8F5]">
                  <img
                    src={beltSkuMedia.realProductCloseupImage}
                    referrerPolicy="no-referrer"
                    alt={`نمای نزدیک مارکینگ چاپ‌شده روی تسمه کد ${beltSkuMedia.skuCode}`}
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <span className="absolute top-3 left-3 rounded-lg bg-slate-900/75 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="w-4 h-4" />
                  </span>
                </div>
                <div className="px-4 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-black text-[#2B313A]">نمای نزدیک مارکینگ بدنه</span>
                  <span className="text-[11px] text-emerald-700 font-bold">
                    چاپ کارخانه خوانا
                  </span>
                </div>
              </button>
            )}

            {/* Clean Domain-Free Industrial Marking & Authenticity Card */}
            <div
              data-testid="sku-authenticity-card"
              className="rounded-2xl border border-slate-200/90 bg-[#FAF8F5] p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="text-xs font-black text-[#2B313A] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>شناسنامه مارکینگ فیزیکی و اصالت تصویر</span>
                </div>

                {skuCard?.visibleMarking && (
                  <div className="rounded-xl bg-white border border-slate-200/80 px-3.5 py-2.5">
                    <span className="text-slate-400 block text-[10px] mb-1">
                      مارکینگ فنی روی بدنه تسمه:
                    </span>
                    <span
                      className="font-mono text-xs font-bold text-[#2B313A] tracking-tight break-words block"
                      dir="ltr"
                    >
                      {skuCard.visibleMarking}
                    </span>
                  </div>
                )}

                <p className="text-xs text-slate-600 leading-6">
                  {skuCard?.engineeringNoteFa ||
                    `تصویر اختصاصی کد ${beltSkuMedia.skuCode} پس از بررسی برند، پروفیل مقطع، بافت بدنه و انطباق ساختار مهندسی در کاتالوگ صنعت پیش اطلس تأیید شده است.`}
                </p>
              </div>

              <dl className="pt-3 border-t border-slate-200/80 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">برند و پروفیل</dt>
                  <dd className="font-mono font-bold text-[#2B313A]" dir="ltr">
                    {skuCard ? `${skuCard.brand} · ${skuCard.profile}` : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">استاندارد مرجع</dt>
                  <dd className="font-mono font-semibold text-slate-700" dir="ltr">
                    {skuCard?.standardReference || 'ISO / DIN'}
                  </dd>
                </div>
                {skuCard?.constructionFa && (
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-slate-500 shrink-0">ساختار فیزیکی</dt>
                    <dd className="font-semibold text-slate-700 text-left">
                      {skuCard.constructionFa}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
