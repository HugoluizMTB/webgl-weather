import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:single` gera um único index.html com tudo embutido (útil para hospedar a demo).
// `base: "./"` deixa os caminhos relativos, então o build funciona em qualquer subpasta (GitHub Pages).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
}));
