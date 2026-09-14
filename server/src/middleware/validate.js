// Generic request-validation middleware.
//
// RULE (security/correctness): every route under /api/auth and
// /api/allocations must reject malformed input with a 400 before it reaches
// business logic — bad shapes should never reach Mongoose/store code where
// they could throw unhandled errors or, worse, be coerced into something
// unintended.
//
// Usage: router.post('/path', validate({ body: someZodSchema }), handler)
// Validated/coerced values are written back onto req.body / req.params /
// req.query so downstream handlers can trust their shape.
export function validate({body, params, query} = {}) {
  return (req, res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      if (query) req.query = query.parse(req.query ?? {});
      next();
    } catch (err) {
      const issues = Array.isArray(err?.issues)
        ? err.issues.map(i => ({path: i.path.join('.'), message: i.message}))
        : undefined;
      res.status(400).json({message: 'Invalid request', issues});
    }
  };
}
