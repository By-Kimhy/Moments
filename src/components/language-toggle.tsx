import { setLanguage } from "@/app/actions/language";

export function LanguageToggle({ label }: { label: string }) {
  return (
    <form action={setLanguage}>
      <button type="submit" className="rounded-full border border-line px-3 py-1 text-sm">
        {label}
      </button>
    </form>
  );
}
