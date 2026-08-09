import {
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config";

// Regenerate the PWA icons in public/ from a single source SVG:
//   npm run generate-pwa-assets
// The minimal-2023 preset emits exactly the icon set referenced by the
// manifest (pwa-64/192/512, maskable-512, apple-touch-icon-180, favicon.ico),
// so public/icon.svg stays the single source of truth for the app icon.
export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset,
  images: ["public/icon.svg"],
});
