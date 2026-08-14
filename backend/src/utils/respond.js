// Uniform response envelope: { data } on success, { error:{code,message} } on failure.
export const ok = (res, data, status = 200) => res.status(status).json({ data });

export const fail = (res, code, message, status) =>
  res.status(status).json({ error: { code, message } });
