import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

export interface CalibrationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalibrationTextStyle {
  rotateDeg: number;
  skewXDeg: number;
  fillColor: string;
  opacity: number;
  fontSizeRatio: number;
  letterSpacing: number;
  lineCount?: number;
  curveSagRatio?: number;
}

export interface MasterCalibrationItem {
  id: string;
  masterWebpPublicPath: string;
  masterBrand: string;
  masterProfile: string;
  masterMarkingCode: string;
  isBrandedMaster: boolean;
  eraseBeforePrint: boolean;
  surfaceTone: 'dark' | 'light' | 'colored';
  brandLogoSafeZone: CalibrationRect | null;
  eraseRect: CalibrationRect;
  textStyle: CalibrationTextStyle;
  hasOverride: boolean;
}

const DEFAULT_TEST_CODES: Record<string, string> = {
  'SWR-WRAPPED': 'A-16',
  'SWR-COGGED': 'BX-48',
  'DONGIL-WRAPPED': 'A-45',
  'OPTIBELT-WRAPPED': 'B-68',
  'OPTIBELT-WEDGE': 'SPB 2000',
  'OPTIBELT-COGGED': 'XPA 1400',
  'OPTIBELT-TIMING': '1200-8M',
  'OPTIBELT-POLYV': '6PK1540',
  'MEGADYNE-WRAPPED': 'B-72',
  'MEGADYNE-TIMING': '1120-8M',
  'BANDO-WRAPPED': 'B-56',
  'MITSUBOSHI-WRAPPED': 'A-38',
  'CLEAN-WRAPPED': 'FORZA B-64',
  'CLEAN-COGGED': 'MARSHAL AX 42',
  'CLEAN-TIMING-TRAP': 'MARSHAL 540H100',
  'CLEAN-TIMING-DOUBLE': 'FORZA 600DH',
  'CLEAN-TIMING-HTD': 'BERAVO 960-8M',
  'CLEAN-TIMING-PU': 'FORZA AT10-1280',
  'CLEAN-TIMING-COATED': 'FORZA AT20-12580',
  'CLEAN-POLYV': 'DONGIL 8PK1825',
  'CLEAN-HEX': 'FORZA BB 108',
  'CLEAN-PU-ROUND': 'VOLTA PU-8MM',
  'CLEAN-PU-VBELT': 'VOLTA A-13',
  'CLEAN-CROWNED': 'CROWN 17MM',
  'CLEAN-CONVEYOR': 'PVC 2MM 2PLY',
};

interface Props {
  onCalibrationSaved?: () => void;
}

export const BeltMarkingCalibrationStudio: React.FC<Props> = ({ onCalibrationSaved }) => {
  const [items, setItems] = useState<MasterCalibrationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('SWR-WRAPPED');

  const [eraseRect, setEraseRect] = useState<CalibrationRect>({ x: 0.72, y: 0.51, w: 0.13, h: 0.19 });
  const [textStyle, setTextStyle] = useState<CalibrationTextStyle>({
    rotateDeg: -10.5,
    skewXDeg: -6,
    fillColor: '#A9AEB4',
    opacity: 0.84,
    fontSizeRatio: 0.41,
    letterSpacing: 1.5,
    lineCount: 2,
    curveSagRatio: 0.055,
  });
  const [targetCode, setTargetCode] = useState<string>('A-16');
  const [showRawMaster, setShowRawMaster] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const debounceRef = useRef<number | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const loadCalibrations = useCallback(async (preserveSelection = false) => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/belt-audit/calibrations', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json?.success && Array.isArray(json.items)) {
        setItems(json.items);
        if (!preserveSelection && json.items.length > 0) {
          const first: MasterCalibrationItem = json.items[0];
          setSelectedId(first.id);
          setEraseRect({ ...first.eraseRect });
          setTextStyle({
            ...first.textStyle,
            lineCount: first.textStyle.lineCount ?? 1,
            curveSagRatio: first.textStyle.curveSagRatio ?? 0,
          });
          setTargetCode(DEFAULT_TEST_CODES[first.id] || first.masterMarkingCode);
        }
      }
    } catch {
      setStatusMsg({ kind: 'err', text: 'خطا در دریافت لیست کالیبراسیون ۳۷ مستر.' });
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadCalibrations(false);
  }, [loadCalibrations]);

  const activeMaster = items.find((it) => it.id === selectedId) || null;

  const handleSelectMaster = (nextId: string) => {
    const found = items.find((it) => it.id === nextId);
    if (!found) return;
    setSelectedId(found.id);
    setEraseRect({ ...found.eraseRect });
    setTextStyle({
      ...found.textStyle,
      lineCount: found.textStyle.lineCount ?? 1,
      curveSagRatio: found.textStyle.curveSagRatio ?? 0,
    });
    setTargetCode(DEFAULT_TEST_CODES[found.id] || found.masterMarkingCode);
    setShowRawMaster(false);
    setStatusMsg(null);
  };

  const requestLivePreview = useCallback(
    async (
      mId: string,
      code: string,
      rect: CalibrationRect,
      style: CalibrationTextStyle,
    ) => {
      if (!mId) return;
      if (previewAbortRef.current) previewAbortRef.current.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;
      setPreviewLoading(true);
      try {
        const res = await fetch('/api/belt-audit/calibrations/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            masterId: mId,
            targetCode: code,
            eraseRect: rect,
            textStyle: style,
          }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!controller.signal.aborted && res.ok && json?.success && json.imageDataUrl) {
          setPreviewUrl(json.imageDataUrl);
        }
      } catch {
        // ignore abort errors
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedId || items.length === 0) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void requestLivePreview(selectedId, targetCode, eraseRect, textStyle);
    }, 110);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [selectedId, targetCode, eraseRect, textStyle, items.length, requestLivePreview]);

  const handleSave = async () => {
    if (!activeMaster) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/belt-audit/calibrations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterId: activeMaster.id,
          eraseRect,
          textStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setStatusMsg({ kind: 'err', text: json?.error || 'ذخیره تغییرات با خطا مواجه شد.' });
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === activeMaster.id
              ? { ...it, eraseRect: json.eraseRect, textStyle: json.textStyle, hasOverride: true }
              : it,
          ),
        );
        setStatusMsg({
          kind: 'ok',
          text: `تنظیمات مارکینگ «${activeMaster.id}» به‌صورت دائمی ذخیره شد و کش تصاویر محصولات به‌روزرسانی گردید.`,
        });
        onCalibrationSaved?.();
      }
    } catch {
      setStatusMsg({ kind: 'err', text: 'خطا در ارتباط با سرور هنگام ذخیره تنظیمات.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!activeMaster) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/belt-audit/calibrations/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterId: activeMaster.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setStatusMsg({ kind: 'err', text: json?.error || 'بازنشانی تنظیمات انجام نشد.' });
      } else {
        setEraseRect({ ...json.eraseRect });
        setTextStyle({
          ...json.textStyle,
          lineCount: json.textStyle.lineCount ?? 1,
          curveSagRatio: json.textStyle.curveSagRatio ?? 0,
        });
        setItems((prev) =>
          prev.map((it) =>
            it.id === activeMaster.id
              ? { ...it, eraseRect: json.eraseRect, textStyle: json.textStyle, hasOverride: false }
              : it,
          ),
        );
        setStatusMsg({
          kind: 'ok',
          text: `تنظیمات مستر «${activeMaster.id}» به مقادیر کالیبره‌شده استاندارد بازگردانی شد.`,
        });
        onCalibrationSaved?.();
      }
    } catch {
      setStatusMsg({ kind: 'err', text: 'خطا در ارتباط با سرور هنگام بازنشانی.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingList) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center text-sm text-slate-600">
        در حال بارگذاری استودیوی تنظیم زنده ۳۷ تصویر مستر...
      </div>
    );
  }

  return (
    <section
      data-testid="calibration-studio-panel"
      className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-[#E06518]" />
            <span>استودیوی تنظیم زنده موقعیت، زاویه و انحنای مارکینگ (۳۷ مستر کاتالوگ)</span>
          </h2>
          <p className="text-xs text-slate-600 leading-6 max-w-3xl">
            هر یک از ۳۷ تصویر مستر واقعی را انتخاب کنید، کد پروفیل دلخواه را برای تست وارد نمایید و موقعیت چاپ، چرخش، انحنای بدنه و اندازه فونت را با پیش‌نمایش آنی تنظیم و به‌صورت دائمی ذخیره کنید.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRawMaster((v) => !v)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-400 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Eye className="w-4 h-4" />
            <span>{showRawMaster ? 'نمایش خروجی مارکینگ‌شده' : 'مقایسه با عکس پایه خام'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Preview Stage (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col items-center justify-center min-h-[380px] sm:min-h-[440px] relative overflow-hidden">
            {activeMaster && (
              <img
                data-testid="studio-preview-image"
                src={showRawMaster ? activeMaster.masterWebpPublicPath : (previewUrl || activeMaster.masterWebpPublicPath)}
                alt={activeMaster.id}
                referrerPolicy="no-referrer"
                className="max-h-[410px] w-full object-contain transition-opacity duration-150"
                style={{ opacity: previewLoading && !showRawMaster ? 0.65 : 1 }}
              />
            )}
            {previewLoading && !showRawMaster && (
              <div className="absolute bottom-3 left-3 text-xs font-bold text-slate-500 bg-white/90 px-3 py-1 rounded-lg border border-slate-200">
                در حال رندر زنده...
              </div>
            )}
          </div>

          {activeMaster && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-slate-900" dir="ltr">
                  {activeMaster.id}
                </span>
                <span aria-hidden="true">·</span>
                <span>برند مرجع: {activeMaster.isBrandedMaster ? activeMaster.masterBrand : 'ساختار پاک بدون لوگو'}</span>
                <span aria-hidden="true">·</span>
                <span>پروفیل نمونه: {activeMaster.masterProfile}</span>
                {activeMaster.hasOverride && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-[#E06518]">تنظیم دستی ذخیره‌شده</span>
                  </>
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-500 tabular-nums" dir="ltr">
                X:{eraseRect.x.toFixed(3)} · Y:{eraseRect.y.toFixed(3)} · W:{eraseRect.w.toFixed(3)} · H:{eraseRect.h.toFixed(3)} · Rot:{textStyle.rotateDeg}°
              </div>
            </div>
          )}

          {statusMsg && (
            <div
              data-testid="studio-status-message"
              className={`rounded-xl border px-4 py-3 text-xs font-bold flex items-center gap-2 ${
                statusMsg.kind === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Right/Controls Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Master Selector */}
          <div className="space-y-1.5">
            <label htmlFor="studio-master-select" className="block text-xs font-black text-slate-800">
              انتخاب تصویر مستر ({toPersianDigits(items.length)} الگو)
            </label>
            <select
              id="studio-master-select"
              data-testid="studio-master-select"
              value={selectedId}
              onChange={(e) => handleSelectMaster(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:border-[#E06518]"
              dir="ltr"
            >
              <optgroup label="مسترهای برند اختصاصی واقعی (۱۲ برند)">
                {items
                  .filter((it) => it.isBrandedMaster)
                  .map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.id} ({it.masterBrand} · {it.masterProfile}){it.hasOverride ? ' ★' : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="مسترهای ساختاری پاک بدون لوگوی رقیب (۱۳ ساختار)">
                {items
                  .filter((it) => !it.isBrandedMaster)
                  .map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.id} ({it.masterProfile}){it.hasOverride ? ' ★' : ''}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {/* Target Code Input */}
          <div className="space-y-1.5">
            <label htmlFor="studio-target-code" className="block text-xs font-black text-slate-800">
              کد پروفیل و سایز آزمایشی روی تسمه
            </label>
            <input
              id="studio-target-code"
              data-testid="studio-target-code"
              type="text"
              value={targetCode}
              onChange={(e) => setTargetCode(e.target.value)}
              placeholder="مثلاً A-16 یا XPA 1400 یا FORZA BB 108"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:border-[#E06518]"
              dir="ltr"
            />
          </div>

          {/* Position & Box Size Sliders */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="text-xs font-black text-slate-800">موقعیت و ابعاد ناحیه چاپ</div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>افقی (X)</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {eraseRect.x.toFixed(3)}
                  </span>
                </div>
                <input
                  data-testid="slider-x"
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.004}
                  value={eraseRect.x}
                  onChange={(e) => setEraseRect((r) => ({ ...r, x: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>عمودی (Y)</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {eraseRect.y.toFixed(3)}
                  </span>
                </div>
                <input
                  data-testid="slider-y"
                  type="range"
                  min={0}
                  max={0.88}
                  step={0.004}
                  value={eraseRect.y}
                  onChange={(e) => setEraseRect((r) => ({ ...r, y: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>عرض (W)</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {eraseRect.w.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.08}
                  max={0.75}
                  step={0.005}
                  value={eraseRect.w}
                  onChange={(e) => setEraseRect((r) => ({ ...r, w: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>ارتفاع (H)</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {eraseRect.h.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.06}
                  max={0.55}
                  step={0.005}
                  value={eraseRect.h}
                  onChange={(e) => setEraseRect((r) => ({ ...r, h: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>
            </div>
          </div>

          {/* Perspective, Curve & Ink Sliders */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="text-xs font-black text-slate-800">زاویه، انحنا و ظاهر جوهر</div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>زاویه چرخش</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {textStyle.rotateDeg}°
                  </span>
                </div>
                <input
                  data-testid="slider-rotate"
                  type="range"
                  min={-65}
                  max={65}
                  step={0.5}
                  value={textStyle.rotateDeg}
                  onChange={(e) => setTextStyle((s) => ({ ...s, rotateDeg: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>انحنای بدنه</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {(textStyle.curveSagRatio ?? 0).toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.16}
                  max={0.16}
                  step={0.005}
                  value={textStyle.curveSagRatio ?? 0}
                  onChange={(e) => setTextStyle((s) => ({ ...s, curveSagRatio: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>اندازه فونت</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {textStyle.fontSizeRatio.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.10}
                  max={0.55}
                  step={0.01}
                  value={textStyle.fontSizeRatio}
                  onChange={(e) => setTextStyle((s) => ({ ...s, fontSizeRatio: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>شفافیت جوهر</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {Math.round(textStyle.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.35}
                  max={1.0}
                  step={0.02}
                  value={textStyle.opacity}
                  onChange={(e) => setTextStyle((s) => ({ ...s, opacity: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>

              <label className="space-y-1 block col-span-2">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>تعداد سطرهای چاپ کارخانه‌ای</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {textStyle.lineCount ?? 1}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={textStyle.lineCount ?? 1}
                  onChange={(e) => setTextStyle((s) => ({ ...s, lineCount: Number(e.target.value) }))}
                  className="w-full accent-[#E06518]"
                />
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="studio-save-btn"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#E06518] hover:bg-[#c55510] disabled:opacity-60 text-white text-xs sm:text-sm font-black inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات دائمی'}</span>
            </button>

            <button
              type="button"
              data-testid="studio-reset-btn"
              disabled={saving}
              onClick={() => void handleReset()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-400 disabled:opacity-60 text-slate-700 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>بازنشانی</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
