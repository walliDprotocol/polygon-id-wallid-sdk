// const InitState = {
//   credentials: [],
// };
import { fileURLToPath } from "url";
import path from "path";
import { dirname } from "path";

import { proving, Token } from "@iden3/js-jwz";

import * as uuid from "uuid";

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

import { config } from "dotenv";
config();

const mockStateStorage = {
  provider: "https://matic-mumbai.chainstacklabs.com",
  getLatestStateById: async () => {
    throw new Error(VerifiableConstants.ERRORS.IDENTITY_DOES_NOT_EXIST);
  },
  publishState: async () => {
    return "0xc837f95c984892dbcc3ac41812ecb145fedc26d7003202c50e1b87e226a9b33c";
  },
  getGISTProof: () => {
    return Promise.resolve({
      root: 0n,
      existence: false,
      siblings: [],
      index: 0n,
      value: 0n,
      auxExistence: false,
      auxIndex: 0n,
      auxValue: 0n,
    });
  },
  getGISTRootInfo: () => {
    return Promise.resolve({
      root: 0n,
      replacedByRoot: 0n,
      createdAtTimestamp: 0n,
      replacedAtTimestamp: 0n,
      createdAtBlock: 0n,
      replacedAtBlock: 0n,
    });
  },
};

const getPackageMgr = async (circuitData, prepareFn, stateVerificationFn) => {
  const authInputsHandler = new DataPrepareHandlerFunc(prepareFn);

  const verificationFn = new VerificationHandlerFunc(stateVerificationFn);
  const mapKey =
    proving.provingMethodGroth16AuthV2Instance.methodAlg.toString();
  const verificationParamMap = new Map([
    [
      mapKey,
      {
        key: circuitData.verificationKey,
        verificationFn,
      },
    ],
  ]);

  const provingParamMap = new Map();
  provingParamMap.set(mapKey, {
    dataPreparer: authInputsHandler,
    provingKey: circuitData.provingKey,
    wasm: circuitData.wasm,
  });

  const mgr = new PackageManager();
  const packer = new ZKPPacker(provingParamMap, verificationParamMap);
  const plainPacker = new PlainPacker();
  mgr.registerPackers([packer, plainPacker]);

  return mgr;
};

import {
  IdentityStorage,
  CredentialStorage,
  BjjProvider,
  KmsKeyType,
  IdentityWallet,
  CredentialWallet,
  KMS,
  InMemoryDataSource,
  InMemoryMerkleTreeStorage,
  EthStateStorage,
  defaultEthConnectionConfig,
  core,
  InMemoryPrivateKeyStore,
  CircuitStorage,
  FSKeyLoader,
  CircuitId,
  ProofService,
  AuthHandler,
  PackageManager,
  ZKPPacker,
  PlainPacker,
  DataPrepareHandlerFunc,
  VerificationHandlerFunc,
  VerifiableConstants,
} from "../../../js-sdk/dist/cjs/index.js";

import { ethers } from "ethers";

import { CredentialStatusType } from "../../../js-sdk/dist/cjs/verifiable/constants.js";

const seedPhrase = new TextEncoder().encode("seedseedseedseedseedseedseeduser");
const seedPhraseIssuer = new TextEncoder().encode(
  "seedseedseedseedseedseedseedseed"
);

const { RPC_URL, RHS_URL, WALLET_KEY, CONTRACT_ADDRESS } = process.env;

export default class PolygonController {
  constructor() {}

  initDataStorage() {
    var dataStorage = {
      credential: new CredentialStorage(new InMemoryDataSource()),
      identity: new IdentityStorage(
        new InMemoryDataSource(),
        new InMemoryDataSource()
      ),
      mt: new InMemoryMerkleTreeStorage(40),

      states: new EthStateStorage({
        ...defaultEthConnectionConfig,
        url: RPC_URL,
        contractAddress: CONTRACT_ADDRESS,
      }),
      // states: mockStateStorage,
    };
    this.dataStorage = dataStorage;
  }

  async initCircuit() {
    // initIdentityWallet
    const memoryKeyStore = new InMemoryPrivateKeyStore();
    const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, memoryKeyStore);
    const kms = new KMS();
    kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);

    // initDataStorage
    this.initDataStorage();

    const circuitStorage = new CircuitStorage(new InMemoryDataSource());

    const loader = new FSKeyLoader(path.join(__dirname, "../testdata"));

    await circuitStorage.saveCircuitData(CircuitId.AuthV2, {
      circuitId: CircuitId.AuthV2.toString(),
      wasm: await loader.load(`${CircuitId.AuthV2.toString()}/circuit.wasm`),
      provingKey: await loader.load(
        `${CircuitId.AuthV2.toString()}/circuit_final.zkey`
      ),
      verificationKey: await loader.load(
        `${CircuitId.AuthV2.toString()}/verification_key.json`
      ),
    });

    await circuitStorage.saveCircuitData(CircuitId.AtomicQuerySigV2, {
      circuitId: CircuitId.AtomicQuerySigV2.toString(),
      wasm: await loader.load(
        `${CircuitId.AtomicQuerySigV2.toString()}/circuit.wasm`
      ),
      provingKey: await loader.load(
        `${CircuitId.AtomicQuerySigV2.toString()}/circuit_final.zkey`
      ),
      verificationKey: await loader.load(
        `${CircuitId.AtomicQuerySigV2.toString()}/verification_key.json`
      ),
    });

    await circuitStorage.saveCircuitData(CircuitId.StateTransition, {
      circuitId: CircuitId.StateTransition.toString(),
      wasm: await loader.load(
        `${CircuitId.StateTransition.toString()}/circuit.wasm`
      ),
      provingKey: await loader.load(
        `${CircuitId.StateTransition.toString()}/circuit_final.zkey`
      ),
      verificationKey: await loader.load(
        `${CircuitId.AtomicQueryMTPV2.toString()}/verification_key.json`
      ),
    });

    this.credWallet = new CredentialWallet(this.dataStorage);
    this.identityWallet = new IdentityWallet(
      kms,
      this.dataStorage,
      this.credWallet
    );

    this.proofService = new ProofService(
      this.identityWallet,
      this.credWallet,
      circuitStorage,
      // mockStateStorage
      new EthStateStorage({
        ...defaultEthConnectionConfig,
        url: RPC_URL,
        contractAddress: CONTRACT_ADDRESS,
      })
    );

    this.packageMgr = await getPackageMgr(
      await circuitStorage.loadCircuitData(CircuitId.AuthV2),
      this.proofService.generateAuthV2Inputs.bind(this.proofService),
      this.proofService.verifyState.bind(this.proofService)
    );
    this.authHandler = new AuthHandler(
      this.packageMgr,
      this.proofService,
      this.credWallet
    );

    return { identityWallet: this.identityWallet };
  }

  async issueCredentialOriginal() {
    console.log("=============== issue credential ===============");

    const { did: userDID } = await this.identityWallet.createIdentity({
      method: core.DidMethod.Iden3,
      blockchain: core.Blockchain.Polygon,
      networkId: core.NetworkId.Mumbai,
      // seed: seedPhrase,
      revocationOpts: {
        type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
        baseUrl: RHS_URL,
      },
    });

    console.log("=============== user did ===============");
    console.log(userDID.toString());

    const { did: issuerDID, credential } =
      await this.identityWallet.createIdentity({
        method: core.DidMethod.Iden3,
        blockchain: core.Blockchain.Polygon,
        networkId: core.NetworkId.Mumbai,
        // seed: seedPhraseIssuer,
        revocationOpts: {
          type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
          baseUrl: RHS_URL,
        },
      });

    console.log("=============== issuerDID did ===============", credential);
    console.log(issuerDID.toString());

    const claimReq = {
      credentialSchema:
        "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json/KYCAgeCredential-v2.json",
      type: "KYCAgeCredential",
      credentialSubject: {
        id: userDID.toString(),
        birthday: 19960424,
        documentType: 99,
      },
      expiration: 1693526400,
      revocationOpts: {
        type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
        baseUrl: RHS_URL,
      },
    };

    console.log("=============== claimReq ===============");
    console.log(claimReq);
    let issuerCred = {};
    console.log("=============== RHS_URL ===============");
    console.log(RHS_URL);

    try {
      issuerCred = await this.identityWallet.issueCredential(
        issuerDID,
        claimReq
      );
    } catch (error) {
      console.log("error calling issueCredential", error.message);
      throw error;
    }

    // await this.credWallet.save(issuerCred);

    console.log("===============  issuerCred ===============");
    console.log(JSON.stringify(issuerCred));

    await this.dataStorage.credential.saveCredential(issuerCred);

    // await this.credWallet.save(issuerCred);

    console.log(
      "================= generate Iden3SparseMerkleTreeProof ======================="
    );

    const { oldTreeState } =
      await this.identityWallet.addCredentialsToMerkleTree(
        [issuerCred],
        issuerDID
      );

    console.log(
      "================= push states to rhs ===================",
      oldTreeState
    );

    await this.identityWallet.publishStateToRHS(issuerDID, RHS_URL);

    console.log("================= publish to blockchain ===================");

    const ethSigner = new ethers.Wallet(
      WALLET_KEY,
      this.dataStorage.states.provider
    );
    const txId = await this.proofService.transitState(
      issuerDID,
      oldTreeState,
      true,
      this.dataStorage.states,
      ethSigner
    );

    console.log("================= transaction hash ===================");
    console.log(txId);

    //#region
    // const proofReq = {
    //   id: 1,
    //   circuitId: CircuitId.AtomicQuerySigV2,
    //   optional: false,
    //   query: {
    //     allowedIssuers: ["*"],
    //     type: claimReq.type,
    //     context:
    //       "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld",
    //     credentialSubject: {
    //       documentType: {
    //         $eq: 99,
    //       },
    //     },
    //   },
    // };

    // const authReqBody = {
    //   callbackUrl: "http://localhost:8080/callback?id=1234442-123123-123123",
    //   reason: "reason",
    //   message: "mesage",
    //   did_doc: {},
    //   scope: [proofReq],
    // };

    // const id = uuid.v4();
    // const authReq = {
    //   id,
    //   typ: "application/iden3comm-plain-json",
    //   type: "https://iden3-communication.io/" + "authorization/1.0/request",
    //   thid: id,
    //   body: authReqBody,
    //   from: issuerDID.id.string(),
    // };

    // const msgBytes = new TextEncoder().encode(JSON.stringify(authReq));
    // const authRes =
    //   await this.authHandler.handleAuthorizationRequestForGenesisDID(
    //     userDID,
    //     msgBytes
    //   );

    // const tokenStr = authRes.token;
    // console.log("tokenStr", tokenStr);
    // console.log(assert(typeof tokenStr == "string"));
    // const token = await Token.parse(tokenStr);
    // console.log(assert(typeof token == "object"));
    //#endregion
  }

  listCredentials() {
    return this.credWallet.list();
  }
}
