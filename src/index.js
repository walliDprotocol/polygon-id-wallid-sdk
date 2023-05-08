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

  let userDID = await polygon.createIdentity();
  let issuerDID = await polygon.createIdentity();

  let { credentials, txId } = await polygon.issueCredentialOriginal(
    userDID,
    issuerDID
  );
  console.log("=====credentials=====\n", credentials);

  let listCredentials = await polygon.listCredentials();
  console.log("=====listCredentials=====\n", listCredentials);

  let zkp = await polygon.getZKP(
    "KYCAgeCredential",
    issuerDID,
    userDID,
    credentials,
    txId
  );
  console.log("=====zkp=====\n", zkp);
})();

// polygon.issueCredentialOriginal();
