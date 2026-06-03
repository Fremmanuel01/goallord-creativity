// ============================================================
// utils/passwordPolicy.js - shared password strength policy
//
// Minimum 8 characters with at least one letter and one digit.
// Applied wherever a NEW password is set (register, change,
// reset). Existing hashed passwords are unaffected.
// ============================================================

const MIN_LENGTH = 8;

// Returns null if the password is acceptable, otherwise an error string.
function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

function isValidPassword(pw) {
  return passwordError(pw) === null;
}

module.exports = { passwordError, isValidPassword, MIN_LENGTH };
