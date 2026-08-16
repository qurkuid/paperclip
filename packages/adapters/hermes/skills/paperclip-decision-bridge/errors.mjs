export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export class OperationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OperationError";
  }
}
