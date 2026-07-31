export class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
export function asHttpError(error) {
  if (error instanceof HttpError) return error;
  return new HttpError(500, 'internal_error', 'An internal error occurred');
}
