import fs from 'node:fs';
import {build, type BuildOptions} from 'esbuild';
// @ts-ignore
import esbuildPluginLicense from "esbuild-plugin-license";
import pkg from './package.json' with {type: 'json'};

fs.writeFileSync('src/version.ts', ``
    + `// ╔══════════════════════════════════════════════════════════════════════╗\n`
    + `// ║         This file is auto-generated at build time.                   ║\n`
    + `// ║   Do NOT edit manually. Any changes will be overwritten.             ║\n`
    + `// ╚══════════════════════════════════════════════════════════════════════╝\n`
    + `\n`
    + `export default {\n`
    + `  name: ${JSON.stringify(pkg.name)},\n`
    + `  version: ${JSON.stringify(pkg.version)},\n`
    + `};\n`
);

// Externalize all runtime dependencies – esbuild only bundles our own code.
// Node resolves these from the sibling node_modules/ directory at runtime.
const externalDeps = Object.keys(pkg.dependencies ?? {});

const options: BuildOptions = {
    tsconfig: './tsconfig.json',
    bundle: true,
    minify: false,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    legalComments: 'linked',
} as const;

function template(deps: any[]): string {
    return deps
        .map((d) => {
            const name = d.packageJson?.name ?? 'UNKNOWN';
            const version = d.packageJson?.version ?? 'UNKNOWN';
            const license = d.packageJson?.license ?? 'UNKNOWN';

            const text = (
                d.licenseText ??
                d.licenseFileText ??
                d.license ??
                ''
            ).toString().trim();

            return `${name}@${version} -- ${license}\n\n${text}`;
        })
        .join(`\n\n${'-'.repeat(50)}\n\n`);
}

function licensePlugin(bundle: string) {
    const output = {
        file: `bin/${bundle}.LICENSES.txt`,
        template,
    } as any;

    return esbuildPluginLicense({
        banner: `/*! <%= pkg.name %> v<%= pkg.version %> | <%= pkg.license %> */`,
        thirdParty: {
            includePrivate: false,
            output,
        }
    });
}

await Promise.all([
    build({
        ...options,
        entryPoints: ['./src/main.ts'],
        outfile: 'bin/main.js',
        external: externalDeps,
        plugins: [licensePlugin('main.js')],
    }),
    build({
        ...options,
        entryPoints: ['./src/post.ts'],
        outfile: 'bin/post.js',
        external: externalDeps,
        plugins: [licensePlugin('post.js')],
    }),
]);