import { defineConfig } from 'zotero-plugin-scaffold'
import pkg from './package.json'
import { copyFileSync } from 'fs'

export default defineConfig({
  source: ['src', 'addon'],
  dist: 'build',
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  // updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
  //   pkg.version.includes('-') ? 'update-beta.json' : 'update.json'
  // }`,
  updateURL: `https://raw.githubusercontent.com/{{owner}}/{{repo}}/main/${
    pkg.version.includes('-') ? 'update-beta.json' : 'update.json'
  }`,
  xpiDownloadLink: 'https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi',

  server: {
    asProxy: true,
  },

  build: {
    assets: ['addon/**/*.*'],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: '{{buildTime}}',
    },
    esbuildOptions: [
      {
        entryPoints: ['src/index.ts'],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: 'firefox115',
        outfile: `build/addon/chrome/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
    // If you want to checkout update.json into the repository, uncomment the following lines:
    makeUpdateJson: {
      hash: false,
    },
    hooks: {
      'build:makeUpdateJSON': (ctx) => {
        try {
          copyFileSync('build/update.json', 'update_gitignore.json')
        } catch (err) {
          console.log('Some Error: ', err)
        }
        try {
          copyFileSync('build/update-beta.json', 'update-beta_gitignore.json')
        } catch (err) {
          console.log('Some Error: ', err)
        }
      },
    },
  },
  // release: {
  //   bumpp: {
  //     execute: "npm run build",
  //   },
  // },

  // If you need to see a more detailed build log, uncomment the following line:
  // logLevel: "trace",
})
