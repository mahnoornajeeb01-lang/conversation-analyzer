/**
 * Static export: `npm run build` writes the dashboard to out/, which the backend serves
 * at "/" so one address gives both the site and the API.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
};

export default nextConfig;
