import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gestión de equipo se unificó en Equipo y accesos.
  async redirects() {
    return [
      { source: '/admin/users', destination: '/admin/accesos', permanent: false },
      // Red VIP / referral program retired: its screens open the Aliados module.
      { source: '/dashboard/admin/escalas', destination: '/dashboard/aliados-directos', permanent: false },
      { source: '/dashboard/admin/liquidaciones', destination: '/dashboard/aliados-directos', permanent: false },
      { source: '/dashboard/admin/aliados', destination: '/dashboard/aliados-directos', permanent: false },
      { source: '/dashboard/aliados/:slug', destination: '/dashboard/aliados-directos', permanent: false },
      // Old ally sign-up form (no data authorization): replaced by Vinculación de aliados, which asks both authorizations.
      { source: '/unete', destination: '/aliados/vincular', permanent: false },
    ];
  },
};

export default nextConfig;
