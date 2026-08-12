import {
  defineConfig,
  minimal2023Preset as base,
} from "@vite-pwa/assets-generator/config";

// Regenerate the PWA icons in public/ from a single source SVG:
//   npm run generate-pwa-assets
// The minimal-2023 preset emits exactly the icon set referenced by the
// manifest (pwa-64/192/512, maskable-512, apple-touch-icon-180, favicon.ico),
// so public/icon.svg stays the single source of truth for the app icon.
//
// The maskable + apple variants add padding around the source; we fill that
// padding with the brand navy so the icon is FULL-BLEED (no transparent
// corners). Otherwise the installed desktop/home-screen icon shows a smaller
// navy square floating on white where the transparent padding sits.
const BG = "#0f172a";

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset: {
    ...base,
    maskable: {
      ...base.maskable,
      resizeOptions: { ...base.maskable.resizeOptions, background: BG },
    },
    apple: {
      ...base.apple,
      resizeOptions: { ...base.apple.resizeOptions, background: BG },
    },
  },
  images: ["public/icon.svg"],
});
