import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthError, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextValue = {
  user: User | null;
  isLoaded: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | AuthError | null; needsEmailConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<{ error: Error | AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | AuthError | null }>;
  signOut: () => Promise<{ error: Error | AuthError | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoaded(true);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setUser(null);
        else setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoaded,
    signIn: async (email, password) => {
      if (!supabase) return { error: new Error('Supabase Auth is not configured.') };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email, password) => {
      if (!supabase) return { error: new Error('Supabase Auth is not configured.'), needsEmailConfirmation: false };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      return { error, needsEmailConfirmation: !error && !data.session };
    },
    resetPassword: async (email) => {
      if (!supabase) return { error: new Error('Supabase Auth is not configured.') };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error };
    },
    updatePassword: async (password) => {
      if (!supabase) return { error: new Error('Supabase Auth is not configured.') };
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    },
    signOut: async () => {
      if (!supabase) return { error: new Error('Supabase Auth is not configured.') };
      const { error } = await supabase.auth.signOut();
      return { error };
    },
  }), [user, isLoaded]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAppAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAppAuth must be used inside AuthProvider.');
  return value;
}
