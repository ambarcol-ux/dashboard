import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gestión de equipo se unificó en Equipo y accesos.
  async redirects() {
    return [
      { source: '/admin/users', destination: '/admin/accesos', permanent: false },
      // Commission model retired: its screens go back to the Panel.
      { source: '/dashboard/admin/escalas', destination: '/dashboard', permanent: false },
      { source: '/dashboard/admin/liquidaciones', destination: '/dashboard', permanent: false },
      // Old ally sign-up form (no data authorization): replaced by Vinculación de aliados, which asks both authorizations.
      { source: '/unete', destination: '/aliados/vincular', permanent: false },
    ];
  },
};

export default nextConfig;
