import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docx-движок работает только на сервере; jszip не должен попадать в клиентский бандл.
  serverExternalPackages: ["jszip"],
};

export default nextConfig;
