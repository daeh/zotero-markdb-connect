import type { Config } from 'release-it'

export default {
  git: {
    // commit: true,
    // tag: true,
    // push: true,
    tagName: 'v${version}',
  },
  github: {
    release: true,
    assets: ['build/*.xpi'],
    // preRelease: true,
    // draft: true,
    web: true,
    comments: {
      submit: true,
      issue:
        ':rocket: _This issue has been resolved in v${version}. See [${releaseName}](${releaseUrl}) for release notes._',
      pr: ':rocket: _This pull request is included in v${version}. See [${releaseName}](${releaseUrl}) for release notes._',
    },
  },
  hooks: {
    'before:init': 'npm run lint',
    'after:bump': 'npm run build',
    'after:release': 'echo Successfully released ${name} v${version} to ${repo.repository}.',
    // 'after:release': async (context) => {
    //   const { github, version } = context;
    //   if (github && github.releaseUrl) {
    //     console.log(`Opening draft release for v${version}...`);
    //     await open(github.releaseUrl);
    //   }
    // }
  },
  npm: {
    publish: false,
  },
} satisfies Config
