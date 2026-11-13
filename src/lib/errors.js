/**
 * Satu jenis error untuk semua kegagalan yang "sudah kita duga"
 * (input salah, tidak login, data tidak ada, dan sebagainya).
 * Error lain (bug) akan diperlakukan sebagai kesalahan server 500.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }

  static badRequest(message, code = 'BAD_REQUEST') {
    return new AppError(400, code, message);
  }

  static unauthorized(message = 'Kamu perlu masuk dulu.', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static notFound(message = 'Data tidak ditemukan.', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static gone(message, code = 'GONE') {
    return new AppError(410, code, message);
  }

  static badGateway(message, code = 'UPSTREAM_ERROR') {
    return new AppError(502, code, message);
  }
}
