module.exports = {
  toolkitSidebar: [
    "intro",
    {
      type: "category",
      label: "Concepts",
      items: ["concepts/concepts"]
    },
    {
      type: "category",
      label: "Scripting",
      items: ["scripting/script-basics", "scripting/common-examples"]
    },
    "architecture",
    {
      type: "category",
      label: "Runtime API",
      items: [
        "runtime/game-manager-and-scenes",
        "runtime/actors-and-collisions",
        "runtime/input",
        "runtime/assets-and-rendering",
        "runtime/text-and-window",
        "runtime/audio",
        "runtime/persistence-and-interrupts"
      ]
    }
  ]
};
