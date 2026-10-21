export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'txt',
  'ged',
] as const;

export type UploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export const UPLOAD_MIME_TYPES: Readonly<
  Record<UploadExtension, readonly string[]>
> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  txt: ['text/plain'],
  ged: [
    'text/plain',
    'application/x-gedcom',
    'text/vnd.familysearch.gedcom',
    'application/octet-stream',
  ],
};
