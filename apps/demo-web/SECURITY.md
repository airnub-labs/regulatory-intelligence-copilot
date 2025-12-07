# Security Requirements

## Next.js Version Requirements

**Minimum Required Version: 16.0.7**

This project enforces a minimum Next.js version of **16.0.7** due to critical security vulnerabilities:

### CVE Fixes in Next.js 16.0.7

1. **CVE-2025-55182** - Remote Code Execution vulnerability
   - Severity: Critical
   - Fixed in: Next.js 16.0.7

2. **CVE-2025-66478** - Remote Code Execution vulnerability
   - Severity: Critical
   - Fixed in: Next.js 16.0.7

### Version Enforcement

The `package.json` uses `>=16.0.7` version constraints to ensure:
- No installations below the minimum secure version
- Automatic updates to newer secure versions are allowed
- Prevents accidental downgrades to vulnerable versions

### Related Packages

The following Next.js-related packages also enforce the same minimum version:
- `@next/eslint-plugin-next`: >=16.0.7
- `eslint-config-next`: >=16.0.7

### Verification

To verify you're using a secure version:

```bash
pnpm list next
```

Ensure the version is 16.0.7 or higher.

### References

- [Next.js Security Advisories](https://github.com/vercel/next.js/security/advisories)
- [NIST National Vulnerability Database](https://nvd.nist.gov/)
