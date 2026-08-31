import type { AuthUser } from "./lib/auth.js";

export type AppEnv = {
  Variables: {
    user: AuthUser;
  };
};

export type SessionResponse =
  | {
      authenticated: true;
      user: AuthUser;
    }
  | {
      authenticated: false;
      user: null;
      error: string;
    };
