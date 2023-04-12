import PolygonController from "./polygonid/index.js";

const polygon = new PolygonController();
import { config } from "dotenv";
console.log("Hello, dotenv!\n", config());

console.log("Hello, world!\n");

console.log("WALLET_KEY", process.env.WALLET_KEY);
console.log("RPC_URL", process.env.RPC_URL);
console.log("RHS_URL", process.env.RHS_URL);

(async () => {
  const { identityWallet } = await polygon.initCircuit();
  // .then(polygon.identityCreation())
  console.log("=====identityWallet=====\n", identityWallet);

  let userWallet = await polygon.issueCredentialOriginal();
  console.log("=====userWallet=====\n", userWallet);

  let listCredentials = await polygon.listCredentials();
  console.log("=====listCredentials=====\n", listCredentials);
})();

// polygon.issueCredentialOriginal();
