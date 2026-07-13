/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // These packages resolve platform-specific executable files at Node runtime.
  // Keeping them external prevents Webpack from traversing their dynamic loaders.
  serverExternalPackages: ['ffmpeg-static', '@ffprobe-installer/ffprobe', '@xenova/transformers'],
};

export default nextConfig;
