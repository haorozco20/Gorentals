# Guided employee rental entry

The availability endpoint returns only a Boolean, checks the authenticated employee's approval and create/edit permission, and excludes another employee's report IDs. Anonymous execution is revoked. Final saves still lock and recheck the owner's rental state, so a successful earlier availability check does not bypass conflict validation.

Employee reads include canonical owner totals, payment values and adjustments for their own reports. Saves preserve owner discounts, extras, status and unrelated rental properties. No existing rental rows are migrated or removed.

Verification used a transaction that created a temporary rental, applied owner adjustments, edited it as its employee, checked overlapping bookings and NIO full payment, then revoked edit permission and confirmed rejection. The transaction was rolled back; no test rentals remain.

Security advisor findings: existing authenticated SECURITY DEFINER warnings remain, including the new availability endpoint, which deliberately needs restricted access to the owner state and exposes no customer details. Existing leaked-password protection is disabled. This change does not alter authentication settings.

References:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
