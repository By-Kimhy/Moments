"use client";

import { useActionState } from "react";
import type { OwnVendor } from "@api/contract";
import { CATEGORY_KEYS, PROVINCE_KEYS, PROVINCES, VENDOR_CATEGORIES } from "@api/lib/vendor-catalog";
import { createVendor, replyToReview, submitVendor, updateVendor } from "@/app/actions/vendors";
import { Field, Message, Select, TextArea, buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

type T = Messages["vendors"];
type Locale = "km" | "en";

const Saved = ({ text }: { text: string }) => <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{text}</p>;

function CategoryAndProvince({ t, locale, values, errors }: { t: T; locale: Locale; values: { category?: string; province?: string }; errors?: Record<string, string[] | undefined> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Select label={t.category} name="category" defaultValue={values.category ?? "PHOTOGRAPHY"} errors={errors?.category}>
        {CATEGORY_KEYS.map((c) => (
          <option key={c} value={c}>
            {VENDOR_CATEGORIES[c][locale]}
          </option>
        ))}
      </Select>
      <Select label={t.province} name="province" defaultValue={values.province ?? "phnom-penh"} errors={errors?.province}>
        {PROVINCE_KEYS.map((p) => (
          <option key={p} value={p}>
            {PROVINCES[p][locale]}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function CreateVendorForm({ t, locale }: { t: T; locale: Locale }) {
  const [state, action, pending] = useActionState(createVendor, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.name} name="name" defaultValue={state?.values?.name} errors={state?.errors?.name} required />
      <CategoryAndProvince t={t} locale={locale} values={state?.values ?? {}} errors={state?.errors} />
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.create}
      </button>
    </form>
  );
}

/** The price as the owner typed it: dollars or riel, not minor units. */
const priceInput = (v: OwnVendor) => (v.priceFrom === null ? "" : v.priceCurrency === "USD" ? String(v.priceFrom / 100) : String(v.priceFrom));

export function VendorForm({ vendor, t, locale }: { vendor: OwnVendor; t: T; locale: Locale }) {
  const [state, action, pending] = useActionState(updateVendor.bind(null, vendor.id), undefined);
  const v = state?.values;
  const e = state?.errors;
  const value = (key: keyof OwnVendor & string, fallback = "") => v?.[key] ?? String(vendor[key] ?? fallback);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.name} name="name" defaultValue={value("name")} errors={e?.name} required />
      <Field label={t.slug} name="slug" defaultValue={value("slug")} errors={e?.slug} hint={t.slugHint.replace("{slug}", vendor.slug)} />
      <CategoryAndProvince t={t} locale={locale} values={{ category: value("category"), province: value("province") }} errors={e} />
      <TextArea label={t.descriptionKm} name="descriptionKm" defaultValue={value("descriptionKm")} errors={e?.descriptionKm} />
      <TextArea label={t.descriptionEn} name="descriptionEn" defaultValue={value("descriptionEn")} errors={e?.descriptionEn} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.price} name="priceFrom" inputMode="numeric" defaultValue={v?.priceFrom ?? priceInput(vendor)} errors={e?.priceFrom} />
        <Select label={t.currency} name="priceCurrency" defaultValue={value("priceCurrency", "USD")}>
          <option value="USD">USD $</option>
          <option value="KHR">KHR ៛</option>
        </Select>
        <Field label={t.phone} name="phone" type="tel" inputMode="tel" defaultValue={value("phone")} errors={e?.phone} />
        <Field label={t.telegramUser} name="telegram" defaultValue={v?.telegram ?? (vendor.telegram ? `@${vendor.telegram}` : "")} errors={e?.telegram} />
      </div>
      <Field label={t.facebookUrl} name="facebookUrl" inputMode="url" defaultValue={value("facebookUrl")} errors={e?.facebookUrl} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.logo}</span>
        <input type="file" name="logo" accept="image/jpeg,image/png,image/webp" className="text-sm" />
      </label>
      <Message text={state?.message} />
      {state?.done && <Saved text={t.saved} />}
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}

export function SubmitForReview({ vendorId, t }: { vendorId: string; t: T }) {
  const [state, action, pending] = useActionState(submitVendor.bind(null, vendorId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Message text={state?.message} />
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.submit}
      </button>
    </form>
  );
}

export function ReplyForm({ vendorId, reviewId, reply, t }: { vendorId: string; reviewId: string; reply: string | null; t: T }) {
  const [state, action, pending] = useActionState(replyToReview.bind(null, vendorId, reviewId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <TextArea label={t.replyTo} name="reply" defaultValue={reply ?? ""} errors={state?.errors?.reply} rows={2} />
      <Message text={state?.message} />
      <button className={`${secondaryButtonClass} self-start`} disabled={pending}>
        {t.sendReply}
      </button>
    </form>
  );
}
