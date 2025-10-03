// convex/users.ts

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";

export const verifyEmail = mutation({
	args: { email: v.string(), code: v.string() },
	handler: async (ctx, args) => {
		const normalizedEmail = args.email.toLowerCase().trim();
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", normalizedEmail))
			.first();
		if (!user) {
			throw new ConvexError("User not found");
		}
		await ctx.db.patch(user._id, {
			emailVerificationTime: Date.now(),
		});
		return { success: true };
	},
});

export const getInternalUserByToken = internalQuery({
	args: { tokenIdentifier: v.string() },
	handler: async (ctx, { tokenIdentifier }) => {
		const accounts = await ctx.db.query("authAccounts").collect();
		const account = accounts.find((a) => (a as any).tokenIdentifier === tokenIdentifier);
		if (!account) return null;
		return await ctx.db.get(account.userId);
	},
});

export const getUserVerificationStatus = query({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();
		return user?.emailVerificationTime !== undefined && user?.emailVerificationTime !== null;
	},
});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return null;
		}
		return await ctx.db.get(userId);
	},
});

export const getUserById = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.userId);
	},
});

export const checkUserExists = query({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();
		return user !== null;
	},
});

export const checkUserProvider = query({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();
		if (!user) {
			return null;
		}
		const accounts = await ctx.db
			.query("authAccounts")
			.filter((q) => q.eq(q.field("userId"), user._id))
			.collect();
		const providers = accounts.map((account) => account.provider);
		return providers;
	},
});

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

export const updateUserProfile = mutation({
	args: {
		name: v.optional(v.string()),
		storageId: v.optional(v.string()),
	},
	handler: async (ctx, { name, storageId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");

		let imageUrl: string | undefined;
		if (storageId) {
			const url = await ctx.storage.getUrl(storageId);
			imageUrl = url ?? undefined;
		}

		await ctx.db.patch(userId, {
			name: name,
			...(imageUrl && { image: imageUrl, storageId }),
		});
	},
});
