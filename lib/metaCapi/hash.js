import crypto from 'crypto'

/** SHA-256, hex-encoded — the hashing scheme Meta's CAPI requires for user_data fields. */
export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')
}

/** em: lowercase + trim before hashing (Meta's normalization rule). */
export function hashEmail(email) {
  const v = String(email || '').trim().toLowerCase()
  return v ? sha256Hex(v) : null
}

/** ph: digits only, country code included, no leading +/00 or symbols. */
export function hashPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits ? sha256Hex(digits) : null
}

/** fn/ln: lowercase + trim before hashing. */
export function hashName(name) {
  const v = String(name || '').trim().toLowerCase()
  return v ? sha256Hex(v) : null
}

/** external_id: hashing is recommended (not required) — we hash it either way. */
export function hashExternalId(id) {
  const v = String(id || '').trim()
  return v ? sha256Hex(v) : null
}
