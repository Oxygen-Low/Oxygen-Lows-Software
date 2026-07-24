import { Request, Response, NextFunction } from "express";
import Zen from "@aikidosec/firewall";
import { createClient } from "@supabase/supabase-js";
import { getAuthorProfile } from "./supabase";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

export async function aikidoUserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.substring(6);
    const decoded = Buffer.from(base64, "base64").toString();
    const [, password] = decoded.split(":");
    token = password;
  }

  if (token && token !== supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        const profile = await getAuthorProfile(user.id);
        Zen.setUser({
          id: user.id,
          name: profile?.username || user.email || "Anonymous",
        });
      }
    } catch (error) {
      // Ignore errors in user identification for firewall
    }
  }

  next();
}
