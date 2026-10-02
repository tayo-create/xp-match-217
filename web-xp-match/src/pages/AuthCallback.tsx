import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { RETURN_TO_KEY, useAuth } from "@/providers/AuthProvider";

/** Production OAuth return: exchanges ?code= for tokens, then heads home. */
export default function AuthCallback() {
  const { exchangeCode } = useAuth();
  const navigate = useNavigate();
  const ran = useRef<boolean>(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = new URLSearchParams(window.location.search).get("code");
    const back = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    const to = back && back.startsWith("/") && !back.startsWith("/auth") ? back : "/";
    if (!code) {
      navigate(to, { replace: true });
      return;
    }
    void exchangeCode(code).finally(() => navigate(to, { replace: true }));
  }, [exchangeCode, navigate]);

  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-3 text-lg text-secondary">
        <Loader2 className="size-5 animate-spin text-primary" /> Signing you in…
      </div>
    </div>
  );
}
