export class SdkApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorType?: string,
    public errorInfo?: unknown,
    public service?: string
  ) {
    super(message);
    this.name = "SdkApiError";
  }
}
