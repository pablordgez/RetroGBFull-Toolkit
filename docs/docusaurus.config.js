// @ts-check

const config = {
  title: "RetroGBFull Toolkit Docs",
  tagline: "Guides and runtime reference for building Game Boy games",
  url: "http://localhost",
  baseUrl: "/",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  organizationName: "retrogbfull",
  projectName: "retrogbfull-docs",
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
      title: "RetroGBFull Docs",
      items: [
        {
          type: "docSidebar",
          sidebarId: "toolkitSidebar",
          position: "left",
          label: "Docs"
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
