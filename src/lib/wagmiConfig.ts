import { createConfig, http } from "wagmi";
import { mainnet, polygon, arbitrum, optimism, base } from "wagmi/chains";
import { injected, walletConnect } from "@wagmi/connectors";

const projectId = "700dd511eaf94e12b87f021c8a6a381c";

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum, optimism, base],
  connectors: [
    injected(),
    walletConnect({
      projectId,
      metadata: {
        name: "Kai Agent",
        description: "AI Agent Gateway — Login with X",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
});
