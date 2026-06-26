import multer from "multer";

/**
 * Multer memory storage — replaces Next.js `await req.formData()`. Files land
 * in req.file / req.files as Buffers (file.buffer), which is exactly what the
 * reused doc-parser functions expect. 20MB cap matches the strictest old route
 * (parse-amortization); per-route logic still re-checks sizes/magic bytes.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export type UploadedFile = Express.Multer.File;
