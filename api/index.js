// تنظیم اجرای تابع روی Edge Runtime
export const config = { runtime: "edge" };

// گرفتن دامنه مقصد از env و حذف اسلش انتهایی (اگه وجود داشت)
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// هدرهایی که نباید به مقصد ارسال بشن (برای جلوگیری از مشکلات proxy)
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(request) {
  // اگر دامنه مقصد تنظیم نشده باشه، خطا برگردون
  if (!TARGET_BASE) {
    return new Response("TARGET_DOMAIN is not configured", { status: 500 });
  }

  try {
    // استخراج path از URL درخواست ورودی
    const pathIndex = request.url.indexOf("/", 8);
    const targetUrl =
      pathIndex === -1
        ? `${TARGET_BASE}/`
        : `${TARGET_BASE}${request.url.slice(pathIndex)}`;

    // ساخت هدرهای جدید برای ارسال به سرور مقصد
    const outgoingHeaders = new Headers();
    let clientIp = null;

    for (const [key, value] of request.headers) {
      const lowerKey = key.toLowerCase();

      // حذف هدرهای غیرضروری یا حساس
      if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;

      // حذف هدرهای اختصاصی ورسل
      if (lowerKey.startsWith("x-vercel-")) continue;

      // ذخیره IP واقعی کاربر (در صورت وجود)
      if (lowerKey === "x-real-ip") {
        clientIp = value;
        continue;
      }

      if (lowerKey === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        continue;
      }

      // اضافه کردن سایر هدرها
      outgoingHeaders.set(key, value);
    }

    // اگر IP کاربر مشخص شد، به هدر مقصد اضافه کن
    if (clientIp) {
      outgoingHeaders.set("x-forwarded-for", clientIp);
    }

    const method = request.method;

    // فقط برای متدهایی که body دارن (مثل POST) بدنه ارسال می‌کنیم
    const shouldSendBody = method !== "GET" && method !== "HEAD";

    // ارسال درخواست به سرور مقصد
    const response = await fetch(targetUrl, {
      method,
      headers: outgoingHeaders,
      body: shouldSendBody ? request.body : undefined,
      duplex: "half", // برای استریم در edge
      redirect: "manual", // جلوگیری از دنبال کردن خودکار ریدایرکت‌ها
    });

    return response;
  } catch (error) {
    // لاگ خطا برای دیباگ
    console.error("Proxy/relay error:", error);

    return new Response("Bad Request: Tunnel Failed", {
      status: 502,
    });
  }
}
