import { createConfig, http } from "wagmi";
import { mainnet, polygon, arbitrum, optimism, base } from "wagmi/chains";
import { injected, walletConnect } from "@wagmi/connectors";

const projectId = "2b5a9f1e3c4d5e6f7a8b9c0d1e2f3a4b";

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
