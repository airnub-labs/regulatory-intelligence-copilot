export function createClient() {
  const query = {
    select() { return this; },
    insert() { return this; },
    update() { return this; },
    upsert() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
  };

  return {
    from() { return query; },
    auth: {
      getSession: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: null, error: null }),
    },
  };
}
