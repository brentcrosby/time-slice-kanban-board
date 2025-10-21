import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const basePath = process.env.VITE_BASE_PATH || (repoName ? `/${repoName}/` : "/");

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
