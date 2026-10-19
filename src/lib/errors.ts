// Throw this anywhere in an API route to send a clean error to the frontend.
// Example: throw new HttpError(404, "Organization not found");
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
