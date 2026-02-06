module.exports = {
  apps: [
    {
      name: "chips-engine",
      script: "npx",
      args: "tsx engine/index.ts",
      cwd: "/home/ubuntu/chips",
      env: {
        USE_HOUSE_BOTS: "false",
        USE_BLOCKCHAIN: "true",
      },
    },
    {
      name: "chips-agents",
      script: "npx",
      args: "tsx agents/play-agents.ts",
      cwd: "/home/ubuntu/chips",
      restart_delay: 5000,
    },
  ],
};
