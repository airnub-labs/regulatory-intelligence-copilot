export function useSession() {
  return { data: null, status: 'unauthenticated' };
}

export function signIn() {
  return Promise.resolve();
}

export function signOut() {
  return Promise.resolve();
}

export function SessionProvider({ children }) {
  return children;
}
