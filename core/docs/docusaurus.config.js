// @ts-check

const config = {
  title: "RetroGBFull Engine Core",
  tagline: "Public API reference for the reusable Game Boy runtime",
  url: "http://localhost",
  baseUrl: "/",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  organizationName: "retrogbfull",
  projectName: "engine-core-docs",
  trailingSlash: false,
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js")
        },
        blog: false,
        pages: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css")
        }
      }
    ]
  ],
  themeConfig: {
    navbar: {
      title: "Engine Core Docs",
      items: [
        {
          type: "docSidebar",
          sidebarId: "engineCoreSidebar",
          position: "left",
          label: "API Reference"
        }
      ]
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4
    }
  }
};

module.exports = config;
