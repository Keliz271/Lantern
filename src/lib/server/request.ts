export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('request_body_too_large');
    this.name = 'RequestBodyTooLargeError';
  }
}

export const readJsonBodyWithLimit = async <T>(
  request: Request,
  maxBytes: number,
  emptyValue: T
): Promise<T> => {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return emptyValue;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  if (totalBytes === 0) return emptyValue;
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
  return JSON.parse(merged.toString('utf-8')) as T;
};
