import type { HostEvent } from "@api/contract";
import { makeCover, removeKhqr, removePhoto, uploadKhqr, uploadPhotos } from "@/app/actions/media";
import { UploadForm } from "@/components/upload-form";
import type { Messages } from "@/i18n/km";

export const fileUrl = (key: string) => `/api/files/${key}`;

export function MediaSection({ event, t, removeLabel }: { event: HostEvent; t: Messages["media"]; removeLabel: string }) {
  const id = event.id;
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.photos}</h2>
        <p className="text-sm text-muted">{t.photosHint}</p>
        {event.photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {event.photos.map((photo, i) => (
              <li key={photo.key} className="overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored images are already resized */}
                <img src={fileUrl(photo.key)} alt="" className="aspect-square w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                  {i === 0 ? (
                    <span className="font-semibold text-accent">{t.cover}</span>
                  ) : (
                    <form action={makeCover.bind(null, id, photo.key)}>
                      <button className="underline">{t.makeCover}</button>
                    </form>
                  )}
                  <form action={removePhoto.bind(null, id, photo.key)}>
                    <button className="text-red-700 underline">{removeLabel}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {event.photos.length < 12 && <UploadForm action={uploadPhotos.bind(null, id)} name="photos" label={t.upload} multiple />}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.khqr}</h2>
        <p className="text-sm text-muted">{t.khqrHint}</p>
        {event.khqrImageKey ? (
          <div className="flex items-end gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- the QR must not be re-compressed */}
            <img src={fileUrl(event.khqrImageKey)} alt="KHQR" className="w-40 rounded-lg border border-line" />
            <form action={removeKhqr.bind(null, id)}>
              <button className="text-sm text-red-700 underline">{removeLabel}</button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted">{t.noKhqr}</p>
        )}
        <UploadForm action={uploadKhqr.bind(null, id)} name="image" label={event.khqrImageKey ? t.replaceKhqr : t.uploadKhqr} />
      </section>
    </>
  );
}
