import { Request, Response, NextFunction } from "express";
import Zen from "@aikidosec/firewall";
import { createClient } from "@supabase/supabase-js";
import { getAuthorProfile } from "./supabase";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

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
      console.error("Aikido firewall user identification error:", error);
    }
  }

  next();
}
