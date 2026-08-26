import type { NextConfig } from 'next'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
const pagesBasePath = process.env.GITHUB_ACTIONS === 'true' && repositoryName && !repositoryName.endsWith('.github.io') ? `/${repositoryName}` : ''

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  env: { NEXT_PUBLIC_BASE_PATH: pagesBasePath },
}

export default nextConfig
