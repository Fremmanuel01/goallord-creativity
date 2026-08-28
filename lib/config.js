// Single source of truth for fee amounts. Previously these env reads + hardcoded
// defaults were copy-pasted in routes/applicants.js, utils/enrolStudent.js and
// utils/paymentRecovery.js - a config change had to be made in three places.
//
// parseInt with an explicit NaN guard: a misconfigured env value (e.g. "abc")
// should fall back to the sane default rather than silently poison a payment
// amount with NaN.
function feeFromEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = {
  get APPLICATION_FEE()    { return feeFromEnv('APPLICATION_FEE', 20000); },
  get FULL_TUITION_FEE()   { return feeFromEnv('FULL_TUITION_FEE', 300000); },
  get MONTHLY_TUITION_FEE() { return feeFromEnv('MONTHLY_TUITION_FEE', 100000); },

  // Total due at enrolment for a given plan (app fee + first tuition payment).
  expectedEnrolmentTotal(plan) {
    return this.APPLICATION_FEE + (plan === 'full' ? this.FULL_TUITION_FEE : this.MONTHLY_TUITION_FEE);
  }
};
