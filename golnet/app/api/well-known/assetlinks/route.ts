import { NextResponse } from "next/server";

export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME ?? "com.palpitai.app";
  const fingerprint = process.env.ANDROID_SHA256_FINGERPRINT ?? "";

  if (!fingerprint) {
    return NextResponse.json([]);
  }

  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]);
}
