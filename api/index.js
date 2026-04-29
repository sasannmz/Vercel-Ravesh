export const config = { runtime: "edge" };

// آدرس پایه
const BASE_URL = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// لیست بخش‌بندی‌شده برای جلوگیری از نوشتن مستقیم همه موارد در یکجا
const HEADER_GROUP_A = ["host", "connection", "keep-alive"];
const HEADER_GROUP_B = ["te", "trailer", "transfer-encoding", "upgrade"];
const HEADER_GROUP_C = ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"];
const HEADER_GROUP_D = ["proxy-authenticate", "proxy-authorization"];

// ترکیب همه موارد در یک Set
const FILTERED_HEADERS = new Set([
  ...HEADER_GROUP_A,
  ...HEADER_GROUP_B,
  ...HEADER_GROUP_C,
  ...HEADER_GROUP_D,
]);

export default async function handler(request) {
  if (!BASE_URL) {
    return new Response("TARGET_DOMAIN is not configured", { status: 500 });
  }

  try {
    const pathIndex = request.url.indexOf("/", 8);
    const destination =
      pathIndex === -1
        ? `${BASE_URL}/`
        : `${BASE_URL}${request.url.slice(pathIndex)}`;

    const headers = new Headers();
    let clientAddress = null;

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();

      if (FILTERED_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;

      if (k === "x-real-ip") {
        clientAddress = value;
        continue;
      }

      if (k === "x-forwarded-for") {
        if (!clientAddress) clientAddress = value;
        continue;
      }

      headers.set(key, value);
    }

    if (clientAddress) {
      headers.set("x-forwarded-for", clientAddress);
    }

    const method = request.method;
    const sendBody = method !== "GET" && method !== "HEAD";

    const response = await fetch(destination, {
      method,
      headers,
      body: sendBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    return response;
  } catch (error) {
    console.error("Request handling error:", error);

    return new Response("Request failed", {
      status: 502,
    });
  }
}
