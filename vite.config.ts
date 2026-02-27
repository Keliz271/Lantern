import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const stripDeprecatedRollupOutputOptions = () => ({
  name: 'strip-deprecated-rollup-output-options',
  apply: 'build' as const,
  enforce: 'post' as const,
  configResolved(config: { build?: { rollupOptions?: { output?: unknown } } }) {
    const output = config.build?.rollupOptions?.output;
    if (!output) return;

    const strip = (target: unknown) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return;
      delete (target as { codeSplitting?: unknown }).codeSplitting;
    };

    if (Array.isArray(output)) {
      output.forEach((entry) => strip(entry));
      return;
    }

    strip(output);
  }
});

export default defineConfig({
  plugins: [sveltekit(), stripDeprecatedRollupOutputOptions()],
  server: {
    watch: {
      ignored: ['**/config/widgets.json']
    }
  }
});
