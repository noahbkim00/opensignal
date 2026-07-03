import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { users, oauthTokens, userConfigs } from "./db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "./crypto";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") {
        return false;
      }

      const googleId = account.providerAccountId;
      const email = user.email;

      if (!email || !googleId) {
        return false;
      }

      // Upsert user
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.googleId, googleId))
        .limit(1);

      let userId: string;

      if (existingUser.length === 0) {
        const [newUser] = await db
          .insert(users)
          .values({
            googleId,
            email,
            name: user.name,
            image: user.image,
            needsReconnect: false,
          })
          .returning({ id: users.id });
        userId = newUser.id;

        // Create default config
        await db.insert(userConfigs).values({
          userId,
          selectedLanguages: [],
        });
      } else {
        userId = existingUser[0].id;
        // Clear reconnect flag on successful auth
        await db
          .update(users)
          .set({ needsReconnect: false, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      // Store/update OAuth tokens
      if (account.refresh_token) {
        const encryptedRefreshToken = encrypt(account.refresh_token);
        const scopes = account.scope || "";

        await db
          .insert(oauthTokens)
          .values({
            userId,
            encryptedRefreshToken,
            accessToken: account.access_token,
            accessTokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            scopes,
          })
          .onConflictDoUpdate({
            target: oauthTokens.userId,
            set: {
              encryptedRefreshToken,
              accessToken: account.access_token,
              accessTokenExpiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
              scopes,
              updatedAt: new Date(),
            },
          });
      }

      return true;
    },

    async jwt({ token, account }) {
      if (account) {
        token.googleId = account.providerAccountId;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.googleId) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.googleId, token.googleId as string))
          .limit(1);

        if (user) {
          session.user.id = user.id;
          session.user.needsReconnect = user.needsReconnect;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
