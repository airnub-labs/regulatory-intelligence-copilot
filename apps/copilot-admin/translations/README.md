# Translations

This directory contains all internationalization (i18n) translation files for the **Regulatory Intelligence Copilot**.

**IMPORTANT:** This application MUST support all 10 required locales. Never commit partial translations.

---

## Required Locales (Mandatory)

| Locale Code | Language | Region | Currency | Base File |
|-------------|----------|--------|----------|-----------|
| `en-IE` | English | Ireland | EUR | `en.json` |
| `ga-IE` | Irish (Gaeilge) | Ireland | EUR | `ga.json` |
| `en-GB` | English | United Kingdom | GBP | `en.json` |
| `en-US` | English | United States | USD | `en.json` |
| `es-ES` | Spanish | Spain | EUR | `es.json` |
| `fr-FR` | French | France | EUR | `fr.json` |
| `fr-CA` | French | Canada | CAD | `fr.json` |
| `de-DE` | German | Germany | EUR | `de.json` |
| `pt-PT` | Portuguese | Portugal | EUR | `pt.json` |
| `pt-BR` | Portuguese | Brazil | BRL | `pt.json` |

---

## Structure

The project uses a **flat structure** with **base language + regional overrides**:

- **Base language files** (`en.json`, `ga.json`, `es.json`, `fr.json`, `de.json`, `pt.json`) contain shared strings for that language
- **Regional override files** (`en-IE.json`, `en-GB.json`, etc.) contain locale-specific strings that override or extend the base

```plaintext
/translations/
├── en.json          # Base English (shared across en-IE, en-GB, en-US)
├── en-IE.json       # Ireland English overrides - DEFAULT
├── en-GB.json       # UK English overrides
├── en-US.json       # US English overrides
├── ga.json          # Base Irish
├── ga-IE.json       # Ireland Irish overrides
├── es.json          # Base Spanish
├── es-ES.json       # Spain Spanish overrides
├── fr.json          # Base French
├── fr-FR.json       # France French overrides
├── fr-CA.json       # Canada French overrides
├── de.json          # Base German
├── de-DE.json       # Germany German overrides
├── pt.json          # Base Portuguese
├── pt-PT.json       # Portugal Portuguese overrides
├── pt-BR.json       # Brazil Portuguese overrides
└── README.md
```

### How Merging Works

At runtime, messages are loaded by merging base + regional:

```typescript
const messages = { ...baseMessages, ...regionMessages };
```

Regional values **take precedence** over base values. This allows:
- 90%+ of strings in base files (no duplication)
- Only locale-specific differences in regional files

---

## Key Format

Use **nested JSON structure** for all translation keys (required by next-intl):

```json
{
  "common": {
    "appName": "Copilot Admin",
    "loading": "Loading...",
    "save": "Save"
  },
  "auth": {
    "signInTitle": "Sign in to your account",
    "email": "Email",
    "password": "Password"
  },
  "dashboard": {
    "welcome": "Welcome back, {name}"
  }
}
```

Access translations using namespaces in code:

```typescript
// With namespace
const t = useTranslations('common');
t('appName'); // "Copilot Admin"

// Or full path
const t = useTranslations();
t('common.appName'); // "Copilot Admin"
```

---

## ICU MessageFormat

Use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) for dynamic content:

### Pluralization

```json
{
  "common.itemCount": "{count, plural, =0 {No items} one {# item} other {# items}}",
  "notifications.count": "{count, plural, =0 {No notifications} one {# notification} other {# notifications}}"
}
```

**Irish pluralization** (supports all 5 plural forms):

```json
{
  "common.itemCount": "{count, plural, =0 {Gan míreanna} one {# mír amháin} two {# mhír} few {# mhír} other {# mír}}"
}
```

### Variables

```json
{
  "dashboard.welcome": "Welcome back, {name}",
  "validation.minLength": "Must be at least {min, number} characters"
}
```

### Currency & Numbers

**Do NOT hardcode currency symbols.** Use `useFormatter()` in components:

```typescript
import { useFormatter } from "next-intl";

function Price({ amount }: { amount: number }) {
  const format = useFormatter();
  return <span>{format.number(amount, { style: "currency" })}</span>;
}
// en-IE: "€1,234.56"
// en-GB: "£1,234.56"
```

The locale's default currency is configured in `i18n/request.ts`.

### Dates & Times

Use named formats from `i18n/request.ts`:

```typescript
import { useFormatter } from "next-intl";

function LastUpdated({ date }: { date: Date }) {
  const format = useFormatter();
  return <span>{format.dateTime(date, "medium")}</span>;
}
// Output: "25 Dec 2024"
```

Available formats: `short`, `medium`, `long`, `full`, `time`, `dateTime`

---

## What Goes Where

### Base Language File (`en.json`)

- Common UI strings (buttons, labels, navigation)
- Error messages
- Validation messages
- Generic notifications
- Strings that are **identical** across all regional variants

### Regional Override File (`en-IE.json`)

- Legal/regulatory terminology
- Tax-related terms (VAT, PRSI, USC)
- Currency configuration
- Date/phone format references
- Jurisdiction-specific content
- Document names (Passport, Driving Licence)
- Anything that differs between en-IE and en-GB

---

## Adding New Translation Keys

When adding new UI that requires translation, you MUST update ALL locales:

### Step 1: Add to ALL Base Language Files

Add the new key to all 6 base files:
- `en.json` - English
- `ga.json` - Irish
- `es.json` - Spanish
- `fr.json` - French
- `de.json` - German
- `pt.json` - Portuguese

### Step 2: Add Regional Overrides (if needed)

If the key has locale-specific variations, add to the appropriate regional files:
- `en-IE.json`, `en-GB.json`, `en-US.json` - English variants
- `ga-IE.json` - Irish
- `es-ES.json` - Spanish
- `fr-FR.json`, `fr-CA.json` - French variants
- `de-DE.json` - German
- `pt-PT.json`, `pt-BR.json` - Portuguese variants

### Step 3: Verify

```bash
pnpm build  # Must pass
```

**NEVER commit with partial translations. All 10 locales must be updated together.**

---

## For Coding Agents

- **ALL 10 locales are mandatory** - never commit partial translations
- **Scan existing translation files** to infer required keys and structure
- **Add keys to ALL 6 base language files** when adding new UI
- **Add regional overrides** where vocabulary differs (en-GB vs en-US, fr-FR vs fr-CA, pt-PT vs pt-BR)
- **Never remove a key** from any file unless it is removed from ALL files
- **Use ICU MessageFormat** for any dynamic content (counts, names, dates)
- **Never hardcode currency symbols** - use `useFormatter()` instead
- **Regional files should be small** - only locale-specific differences
- **Fallback chain**: regional → base → key (missing translations show the key)
- **Irish (ga-IE)** has 5 plural forms - ensure proper ICU plural syntax

---

## Regional Vocabulary Differences

Be aware of vocabulary differences when translating regional variants:

**English (en-GB vs en-US):**
- Colour vs Color
- Licence vs License
- Organise vs Organize

**French (fr-FR vs fr-CA):**
- E-mail vs Courriel
- Week-end vs Fin de semaine

**Portuguese (pt-PT vs pt-BR):**
- Telemóvel vs Celular
- Ficheiro vs Arquivo

---

## Checklist for New Translation Keys

- [ ] Key added to `en.json` (English base)
- [ ] Key added to `ga.json` (Irish base)
- [ ] Key added to `es.json` (Spanish base)
- [ ] Key added to `fr.json` (French base)
- [ ] Key added to `de.json` (German base)
- [ ] Key added to `pt.json` (Portuguese base)
- [ ] Regional overrides added where vocabulary differs
- [ ] ICU MessageFormat used for plurals/variables
- [ ] `pnpm build` passes

---

## Need Help?

Contact project maintainers or open an issue on GitHub.
