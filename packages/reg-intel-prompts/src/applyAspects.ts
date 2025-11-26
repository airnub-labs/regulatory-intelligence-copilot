/**
 * Aspect-Oriented Programming (AOP) utilities for cross-cutting concerns
 *
 * This module implements the "aspect" pattern, which allows you to wrap
 * functions with reusable middleware-like behavior. This is useful for:
 *
 * - **Logging**: Track when functions are called and how long they take
 * - **Sanitization**: Clean sensitive data before it leaves the system
 * - **Error handling**: Catch and transform errors consistently
 * - **Caching**: Add caching without modifying the original function
 *
 * ## How it works
 *
 * An aspect is a function that:
 * 1. Receives the original request and a `next` function
 * 2. Can modify the request before passing it to `next`
 * 3. Can modify the response after `next` returns
 * 4. Can handle errors from `next`
 *
 * ## Example
 *
 * ```typescript
 * // Define a logging aspect
 * const loggingAspect: Aspect<Request, Response> = async (req, next) => {
 *   console.log('Starting request:', req.id);
 *   const start = Date.now();
 *
 *   try {
 *     const response = await next(req);
 *     console.log(`Completed in ${Date.now() - start}ms`);
 *     return response;
 *   } catch (error) {
 *     console.error('Request failed:', error);
 *     throw error;
 *   }
 * };
 *
 * // Define a sanitization aspect
 * const sanitizeAspect: Aspect<Request, Response> = async (req, next) => {
 *   const sanitizedReq = { ...req, data: removePII(req.data) };
 *   return next(sanitizedReq);
 * };
 *
 * // Apply aspects to a base function
 * const enhancedFunction = applyAspects(baseFunction, [
 *   loggingAspect,      // Outermost: runs first, logs timing
 *   sanitizeAspect,     // Inner: sanitizes before base function
 * ]);
 *
 * // Call it like normal
 * const result = await enhancedFunction(myRequest);
 * ```
 *
 * ## Aspect order
 *
 * Aspects are applied in order: first aspect is outermost, last is innermost.
 * This means the first aspect's "before" code runs first, and its "after" code
 * runs last.
 */

/**
 * Aspect type - a middleware function that wraps another function
 *
 * @typeParam Req - The request/input type
 * @typeParam Res - The response/output type
 *
 * @param req - The incoming request
 * @param next - Function to call the next aspect or base function
 * @returns The response, possibly modified
 */
export type Aspect<Req, Res> = (
  req: Req,
  next: (req: Req) => Promise<Res>
) => Promise<Res>;

/**
 * Apply a chain of aspects to a base function.
 *
 * This creates a new function that wraps the base function with all the
 * provided aspects. Each aspect can modify the request before it reaches
 * the base function, and modify the response on the way back.
 *
 * @typeParam Req - The request/input type
 * @typeParam Res - The response/output type
 *
 * @param base - The original function to wrap
 * @param aspects - Array of aspects to apply (first = outermost)
 * @returns A new function with all aspects applied
 *
 * @example
 * ```typescript
 * const wrappedFetch = applyAspects(baseFetch, [
 *   loggingAspect,
 *   sanitizationAspect,
 * ]);
 * ```
 */
export function applyAspects<Req, Res>(
  base: (req: Req) => Promise<Res>,
  aspects: Aspect<Req, Res>[]
): (req: Req) => Promise<Res> {
  return aspects.reduceRight<(req: Req) => Promise<Res>>(
    (next, aspect) => (req: Req) => aspect(req, next),
    base
  );
}
