// Throw this from routes or services for an expected failure. The handler in app.js
// turns it into { error, fields?, ...details }, the shape the frontend's fetchJson already reads.
// details carries machine-readable extras such as { code: "stock_changed", items }.
export class HttpError extends Error {
  constructor(status, message, fields, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.fields = fields;
    this.details = details;
  }
}
