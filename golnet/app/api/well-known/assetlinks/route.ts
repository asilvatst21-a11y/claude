import { NextResponse } from "next/server";

// Google Play signing certificate fingerprint (extracted from installed APK)
const PLAY_FINGERPRINT = "24:A1:F9:DF:CD:6E:4B:8E:AB:FD:79:5C:C7:93:C6:6F:6F:32:31:4D:B1:E8:B5:B3:B6:58:C9:0B:32:57:38:D3";
const PACKAGE_NAME = "app.vercel.palpitai.twa";

export async function GET() {
  const fingerprints = [PLAY_FINGERPRINT];

  // Also include any extra fingerprint from env (e.g. upload key)
  const extra = process.env.ANDROID_SHA256_FINGERPRINT;
  if (extra && extra !== PLAY_FINGERPRINT) {
    fingerprints.push(extra);
  }

  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
