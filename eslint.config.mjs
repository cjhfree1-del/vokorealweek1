import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "out/**",
      "build/**",
      "firebase-functions/lib/**",
      "firebase-functions/node_modules/**",
      "node_modules/**",
    ],
  },
]);
