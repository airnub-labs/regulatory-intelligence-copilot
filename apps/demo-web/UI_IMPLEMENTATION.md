# UI Implementation Guide

This document details the Tailwind v4, shadcn/ui, and Vercel AI SDK implementation in the demo-web application.

## Tech Stack

- **Tailwind CSS v4** - CSS-first utility framework
- **shadcn/ui** - Accessible component library built on Radix UI
- **Radix UI** - Unstyled, accessible component primitives
- **Vercel AI SDK** - Toolkit for building AI-powered applications
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe JavaScript

## Tailwind CSS v4 Configuration

### Key Differences from v3

Tailwind v4 introduces a CSS-first approach:

1. **No `tailwind.config.js`** - Configuration is now in CSS using `@theme`
2. **CSS Import** - Use `@import "tailwindcss"` instead of `@tailwind` directives
3. **@theme blocks** - Define design tokens directly in CSS
4. **CSS Variables** - All colors use HSL color space for theming

### Configuration File

**`src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  /* Typography */
  --font-sans: ui-sans-serif, system-ui, sans-serif;

  /* Border Radius Tokens */
  --radius-sm: 0.375rem;
  --radius: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;

  /* Color Tokens (HSL format) */
  --color-background: 0 0% 100%;
  --color-foreground: 240 10% 3.9%;
  /* ... more color tokens */
}

/* Dark mode using class or data attribute */
.dark, [data-theme="dark"] {
  @theme {
    --color-background: 240 10% 3.9%;
    --color-foreground: 0 0% 98%;
    /* ... dark mode colors */
  }
}

/* Auto dark mode based on system preference */
@media (prefers-color-scheme: dark) {
  :root:not(.light):not([data-theme="light"]) {
    @theme {
      /* Same as manual dark mode */
    }
  }
}
```

### PostCSS Configuration

**`postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}, // v4 plugin
    autoprefixer: {},
  },
}
```

## shadcn/ui Components

### Installation

Components are manually installed in `src/components/ui/`:

```bash
pnpm add @radix-ui/react-slot @radix-ui/react-select @radix-ui/react-scroll-area @radix-ui/react-avatar @radix-ui/react-separator
pnpm add class-variance-authority clsx tailwind-merge lucide-react
```

### Component Library

All components follow the shadcn/ui pattern:

- **Location**: `src/components/ui/`
- **Fully customizable** - Components are copied to your project
- **Accessible** - Built on Radix UI primitives
- **Type-safe** - Full TypeScript support

#### Available Components

1. **Button** - `src/components/ui/button.tsx`
   - Variants: default, destructive, outline, secondary, ghost, link
   - Sizes: sm, default, lg, icon

2. **Input** - `src/components/ui/input.tsx`
   - Accessible form input with focus states

3. **Card** - `src/components/ui/card.tsx`
   - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter

4. **Badge** - `src/components/ui/badge.tsx`
   - Variants: default, secondary, destructive, outline

5. **ScrollArea** - `src/components/ui/scroll-area.tsx`
   - Customized scrollbar with Radix UI primitives

6. **Avatar** - `src/components/ui/avatar.tsx`
   - Avatar, AvatarImage, AvatarFallback

7. **Separator** - `src/components/ui/separator.tsx`
   - Horizontal and vertical separators

### Utility Function

**`src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

This utility merges Tailwind classes intelligently, handling conflicts.

## Chat Components (AI Elements-inspired)

Custom chat components inspired by Vercel AI Elements patterns:

### Message Component

**`src/components/chat/message.tsx`**

```typescript
<Message role="user" | "assistant" content={string} />
<MessageLoading />
```

Features:
- Role-based styling (user vs assistant)
- Avatar integration
- Accessible markup
- Loading state with animated dots

### Chat Container

**`src/components/chat/chat-container.tsx`**

```typescript
<ChatContainer>
  {/* messages */}
</ChatContainer>

<ChatWelcome>
  {/* welcome content */}
</ChatWelcome>
```

Features:
- ScrollArea integration
- Auto-scroll to bottom
- Welcome screen layout

### Prompt Input

**`src/components/chat/prompt-input.tsx`**

```typescript
<PromptInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  placeholder="Type a message..."
  isLoading={isLoading}
/>
```

Features:
- Enter to submit (Shift+Enter for new line)
- Disabled state during loading
- Integrated submit button

## Vercel AI SDK Integration

### Installation

```bash
pnpm add ai @ai-sdk/react
```

### Current Implementation

The current implementation uses custom SSE (Server-Sent Events) streaming:

```typescript
const streamChatResponse = async (response: Response, assistantMessageId: string) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // ... SSE parsing logic
}
```

### Future: AI Elements Integration

Once the AI Elements registry is available, install components:

```bash
npx ai-elements@latest init
npx ai-elements@latest add message prompt-input conversation
```

Components will be installed to `src/components/ai-elements/` and can be used alongside shadcn/ui components.

## Layout Structure

### Root Layout

**`src/app/layout.tsx`**

```typescript
<html lang="en" className="dark" suppressHydrationWarning>
  <body className="font-sans antialiased">{children}</body>
</html>
```

- Dark mode enabled by default with `className="dark"`
- `suppressHydrationWarning` prevents React hydration warnings for theme switching

### Main Page Layout

**`src/app/page.tsx`**

Structure:
1. Header - Title and navigation
2. Profile Selector - Persona and jurisdiction selection
3. Metadata Display - Chat context (conditional)
4. Chat Container - Messages or welcome screen
5. Input Area - Prompt input with disclaimer

## Responsive Design

All components are mobile-responsive:

- **Breakpoints**: Use Tailwind's responsive prefixes (sm:, md:, lg:, xl:)
- **Flexbox/Grid**: Modern layout techniques
- **Touch-friendly**: Adequate tap targets (min 44x44px)

## Accessibility Features

- **Keyboard Navigation** - All interactive elements are keyboard accessible
- **ARIA Labels** - Proper labeling for screen readers
- **Focus States** - Visible focus indicators with `focus:ring-*`
- **Color Contrast** - WCAG AA compliant color combinations
- **Semantic HTML** - Proper heading hierarchy and landmarks

## Color System

All colors use HSL format for easy theming:

```css
--color-primary: 240 5.9% 10%; /* H S L */
```

Usage in Tailwind:
```html
<div className="bg-primary text-primary-foreground">
```

## Development Workflow

### Adding New Components

1. Install Radix UI primitive if needed:
   ```bash
   pnpm add @radix-ui/react-[primitive]
   ```

2. Create component in `src/components/ui/[component].tsx`

3. Use `cn()` utility for className merging

4. Export from component file

### Customizing Themes

Edit `src/app/globals.css` @theme blocks:

```css
@theme {
  --color-primary: 220 90% 56%; /* Change primary color */
  --radius: 0.75rem; /* Change border radius */
}
```

### Adding Dark Mode Support

Colors automatically switch based on:
1. `.dark` class on `<html>`
2. `[data-theme="dark"]` attribute
3. System preference via `prefers-color-scheme`

## Best Practices

1. **Use the `cn()` utility** for combining classNames
2. **Prefer composition** over creating new components
3. **Keep components small** and focused on one responsibility
4. **Use TypeScript** for type safety
5. **Follow accessibility guidelines** - always test with keyboard and screen readers
6. **Leverage Radix UI** for complex interactive components
7. **Document custom components** with JSDoc comments

## Troubleshooting

### Tailwind classes not working

- Ensure `@import "tailwindcss"` is at the top of `globals.css`
- Check that PostCSS is using `@tailwindcss/postcss`
- Verify the file is imported in `layout.tsx`

### Dark mode not working

- Check HTML element has `className="dark"` in `layout.tsx`
- Verify dark mode colors are defined in `.dark { @theme { ... } }`
- Ensure `suppressHydrationWarning` is set

### Component styling conflicts

- Use the `cn()` utility to merge classNames
- Check for conflicting Tailwind classes
- Ensure component prop classNames come last in `cn()`

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI Documentation](https://www.radix-ui.com/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Vercel AI Elements](https://github.com/vercel/ai-elements)
