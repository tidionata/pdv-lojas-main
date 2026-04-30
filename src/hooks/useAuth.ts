import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// ─── Conta de teste local (funciona sem Supabase) ───────────────────────────
const TEST_EMAIL = "tidionata@gmail.com";
const TEST_PASSWORD = "14192583";
const TEST_USER_KEY = "TEST_USER_LOGGED_IN";

const mockTestUser = {
  id: "test-user-local-001",
  email: TEST_EMAIL,
  user_metadata: { full_name: "Usuário Teste", store_name: "Loja Teste" },
  app_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;
// ────────────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar se conta de teste está logada
    if (localStorage.getItem(TEST_USER_KEY) === "true") {
      setUser(mockTestUser);
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (localStorage.getItem(TEST_USER_KEY) === "true") {
      localStorage.removeItem(TEST_USER_KEY);
      setUser(null);
      setSession(null);
      window.location.replace("/auth");
      return;
    }
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  return { user, session, loading, signOut, TEST_EMAIL, TEST_PASSWORD };
}
