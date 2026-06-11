function errorHandler(err, req, res, next) {
  console.error(err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';
  res.status(status).json({ error: true, message });
}

module.exports = errorHandler;
