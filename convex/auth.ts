// convex/auth.ts

/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import type { MutationCtx } from "./_generated/server";

import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { z } from "zod";

import { ResendMagicLink } from "./resend/ResendMagicLink";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		ResendMagicLink,
		GitHub({
			allowDangerousEmailAccountLinking: true,
			profile: (params) => {
				if (typeof params.email !== "string") {
					throw new ConvexError("Email is required");
				}
				if (typeof params.id !== "string" && typeof params.id !== "number") {
					throw new ConvexError("GitHub user ID is required");
				}
				const normalizedEmail = params.email.toLowerCase().trim();
				const { error, data } = z
					.object({
						email: z.email("Invalid email address"),
					})
					.safeParse({ email: normalizedEmail });
				if (error) throw new ConvexError(error.issues[0].message);

				const raw: any = params;
				const image: string | undefined =
					typeof raw.avatar_url === "string" ? raw.avatar_url : typeof raw.picture === "string" ? raw.picture : undefined;

				const name: string | undefined =
					typeof raw.name === "string" && raw.name.trim() ? raw.name : typeof raw.login === "string" ? raw.login : undefined;

				return {
					id: String(params.id),
					email: data.email,
					...(image ? { image } : {}),
					...(name ? { name } : {}),
				};
			},
		}),
		Google({
			allowDangerousEmailAccountLinking: true,
			profile: (params) => {
				const raw: any = params;
				const id: string | undefined =
					typeof raw.id === "string"
						? raw.id
						: typeof raw.id === "number"
							? String(raw.id)
							: typeof raw.sub === "string"
								? raw.sub
								: undefined;
				if (!id) {
					throw new ConvexError("Google user ID is required");
				}
				if (typeof raw.email !== "string") {
					throw new ConvexError("Email is required");
				}
				const normalizedEmail = raw.email.toLowerCase().trim();
				const { error, data } = z
					.object({
						email: z.email("Invalid email address"),
					})
					.safeParse({ email: normalizedEmail });
				if (error) throw new ConvexError(error.issues[0].message);

				const image: string | undefined =
					typeof raw.picture === "string" ? raw.picture : typeof raw.image === "string" ? raw.image : undefined;
				const name: string | undefined = typeof raw.name === "string" && raw.name.trim() ? raw.name : undefined;

				return {
					id,
					email: data.email,
					...(image ? { image } : {}),
					...(name ? { name } : {}),
				};
			},
		}),
	],
	callbacks: {
		async createOrUpdateUser(ctx: MutationCtx, args: any) {
			const normalizedEmail = args.profile.email.toLowerCase().trim();
			const provider = typeof args.provider?.id === "string" ? args.provider.id : args.type === "oauth" ? "oauth" : "magic-link";

			const existingUser = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", normalizedEmail))
				.first();

			const image: string | undefined = typeof args.profile.image === "string" ? args.profile.image : undefined;
			const name: string | undefined =
				typeof args.profile.name === "string" && args.profile.name.trim() ? args.profile.name.trim() : undefined;

			if (existingUser) {
				const currentProviders = existingUser.linkedProviders || [];
				const updates: any = {};

				if (!currentProviders.includes(provider)) {
					updates.linkedProviders = [...currentProviders, provider];
				}
				if (args.type === "oauth" && !existingUser.emailVerificationTime) {
					updates.emailVerificationTime = Date.now();
				}
				if (image && !existingUser.image) {
					updates.image = image;
				}
				if (name && !existingUser.name) {
					updates.name = name;
				}

				if (Object.keys(updates).length > 0) {
					await ctx.db.patch(existingUser._id, updates);
				}
				return existingUser._id;
			}

			const userId = await ctx.db.insert("users", {
				email: normalizedEmail,
				emailVerificationTime: args.type === "oauth" ? Date.now() : undefined,
				linkedProviders: [provider],
				...(image ? { image } : {}),
				...(name ? { name } : {}),
			});

			return userId;
		},
	},
});
