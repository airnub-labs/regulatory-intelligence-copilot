declare module '@supabase/supabase-js' {
  type SupabaseError = { message: string } | null;

  interface SupabaseResponse<T = any> {
    data: T;
    error: SupabaseError;
  }

  interface SupabaseQueryBuilder<T = any> extends PromiseLike<SupabaseResponse<T>> {
    select(columns?: string): SupabaseQueryBuilder<T>;
    insert(values: unknown): SupabaseQueryBuilder<T>;
    update(values: unknown): SupabaseQueryBuilder<T>;
    upsert(values: unknown): SupabaseQueryBuilder<T>;
    eq(column: string, value: unknown): SupabaseQueryBuilder<T>;
    order(column: string, options?: unknown): SupabaseQueryBuilder<T>;
    limit(count: number): SupabaseQueryBuilder<T>;
    maybeSingle(): Promise<SupabaseResponse<T>>;
    single(): Promise<SupabaseResponse<T>>;
  }

  export interface SupabaseClient {
    from<T = any>(table: string): SupabaseQueryBuilder<T>;
  }

  export function createClient(url: string, key: string, options?: unknown): SupabaseClient;
}
