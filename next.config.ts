import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gestión de equipo se unificó en Equipo y accesos.
  async redirects() {
    return [{ source: '/admin/users', destination: '/admin/accesos', permanent: false }];
  },
};

export default nextConfig;
