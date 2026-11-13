// Throw this from routes or services for an expected failure. The handler in app.js
// turns it into { error, fields? }, the shape the frontend's fetchJson already reads.
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.fields = fields;
  }
}
