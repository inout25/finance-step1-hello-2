import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        setProfile(null); 
        setLoading(false); 
        return; 
      }

      const { data, error } = await supabase
        .from("profile")
        .select("user_id, full_name, email, role")
        .eq("user_id", user.id)
        .single();

      if (!ignore) {
        if (error) console.error(error);
        setProfile(data || null);
        setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  return { profile, loading };
}
