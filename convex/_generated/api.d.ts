/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as aiAnalyzer from "../aiAnalyzer.js";
import type * as auth from "../auth.js";
import type * as geocoding from "../geocoding.js";
import type * as http from "../http.js";
import type * as reddit from "../reddit.js";
import type * as resend_ResendMagicLink from "../resend/ResendMagicLink.js";
import type * as scams from "../scams.js";
import type * as scrape_firecrawl from "../scrape/firecrawl.js";
import type * as scrape_index from "../scrape/index.js";
import type * as scrape_singleUrl from "../scrape/singleUrl.js";
import type * as users from "../users.js";
import type * as vapiTools from "../vapiTools.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  aiAnalyzer: typeof aiAnalyzer;
  auth: typeof auth;
  geocoding: typeof geocoding;
  http: typeof http;
  reddit: typeof reddit;
  "resend/ResendMagicLink": typeof resend_ResendMagicLink;
  scams: typeof scams;
  "scrape/firecrawl": typeof scrape_firecrawl;
  "scrape/index": typeof scrape_index;
  "scrape/singleUrl": typeof scrape_singleUrl;
  users: typeof users;
  vapiTools: typeof vapiTools;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
