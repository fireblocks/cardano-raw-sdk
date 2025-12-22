export class IagonApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorType?: string,
    public errorInfo?: any,
    public service?: string
  ) {
    super(message);
    this.name = "IagonApiError";
  }
}
