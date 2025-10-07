// convex/http.ts

import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { handleToolCall } from "./vapiTools";

const http = httpRouter();

auth.addHttpRoutes(http);

// VAPI webhook endpoint for server-side tool calls
http.route({
  path: "/vapi/tool-call",
  method: "POST",
  handler: handleToolCall,
});

export default http;
