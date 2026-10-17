import multer from "multer";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_SHEET_BYTES = 5 * 1024 * 1024;

/** Keeps uploads in memory; images are re-encoded and spreadsheets parsed before anything is stored. */
export const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 12 } });
export const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SHEET_BYTES, files: 1 } });
