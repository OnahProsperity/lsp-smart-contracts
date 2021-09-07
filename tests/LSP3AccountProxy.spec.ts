import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  ERC777UniversalReceiver__factory,
  ExternalERC777UniversalReceiverTester__factory,
  LSP3Account,
  LSP3AccountInit,
  LSP3AccountInit__factory,
  LSP3Account__factory,
  LSP4DigitalCertificate__factory,
  UniversalReceiverAddressStore__factory,
  UniversalReceiverTester__factory,
} from "../build/types";
import { ContractFactory, SignerWithAddress } from "ethers";
import { getDeploymentCost } from "./utils/helpers";

const { proxyRuntimeCodeTemplate } = require("./utils/proxy");

const SupportedStandardsERC725Account_KEY =
  "0xeafec4d89fa9619884b6b89135626455000000000000000000000000afdeb5d6";
// Get key: bytes4(keccak256('ERC725Account'))
const ERC725Account_VALUE = "0xafdeb5d6";

// Interfaces IDs
const ERC165_INTERFACE_ID = "0x01ffc9a7";
const ERC725X_INTERFACE_ID = "0x44c028fe";
const ERC725Y_INTERFACE_ID = "0x2bd57b73";
const ERC1271_INTERFACE_ID = "0x1626ba7e";
const LSP1_INTERFACE_ID = "0x6bb56a14";

// Signatures
const ERC1271_MAGIC_VALUE = "0x1626ba7e";
const ERC1271_FAIL_VALUE = "0xffffffff";

// Universal Receiver
const RANDOM_BYTES32 = "0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b";
// Get key: keccak256('LSP1UniversalReceiverDelegate')
const UNIVERSALRECEIVER_KEY = "0x0cfc51aec37c55a4d0b1a65c6255c4bf2fbdf6277f3cc0730c45b828b6db8b47";
const ERC777TokensRecipient = "0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b";

/**
 * Deploy an LSP3 Account as proxy, referencing to masterContractAddress via delegateCall
 *
 * @param masterContractAddress
 * @param deployer
 * @returns
 */
async function deployLSP3Proxy(masterContractAddress: string, deployer: SignerWithAddress) {
  // deploy proxy contract
  let proxyRuntimeCode = proxyRuntimeCodeTemplate.replace(
    "bebebebebebebebebebebebebebebebebebebebe",
    masterContractAddress.substr(2)
  );
  let tx = await deployer.sendTransaction({
    data: proxyRuntimeCode,
  });
  let receipt = await tx.wait();

  return receipt.contractAddress;
}

describe("LSP3Account via EIP1167 Proxy + initializer (using ethers)", () => {
  let accounts: SignerWithAddress[];
  let owner: SignerWithAddress;

  let lsp3Account: LSP3Account;
  let proxy: LSP3AccountInit;

  describe("> Account deployment", () => {
    beforeAll(async () => {
      accounts = await ethers.getSigners();
      owner = accounts[0];

      lsp3Account = await new LSP3AccountInit__factory(owner).deploy();

      let proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      proxy = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
    });

    it("Should be cheaper to deploy via proxy", async () => {
      // Deploying whole LSP3 Account (not using `initialize` function)
      const lsp3Account = await new LSP3Account__factory(owner).deploy(owner.address);
      const { gasUsed: lsp3AccountDeploymentCost } = await getDeploymentCost(lsp3Account);

      // Deploying via Proxy

      // 1) deploy logic contract
      let lsp3LogicAccount = await new LSP3AccountInit__factory(owner).deploy();
      let lsp3LogicAccountAddress = lsp3LogicAccount.address;

      // 2) setup proxy contract code + deploy
      let proxyRuntimeCode = proxyRuntimeCodeTemplate.replace(
        "bebebebebebebebebebebebebebebebebebebebe",
        lsp3LogicAccountAddress.substr(2)
      );

      let transaction = await owner.sendTransaction({ data: proxyRuntimeCode });
      const { receipt: txReceipt, gasUsed: proxyDeploymentCost } = await getDeploymentCost(
        transaction
      );

      // 3) initialize contract (alternative to constructors)
      let testProxy = await new LSP3AccountInit__factory(owner).attach(txReceipt.contractAddress);

      const initializeTx = await testProxy.initialize(owner.address);
      const { gasUsed: initializeCost } = await getDeploymentCost(initializeTx);
      const totalProxyCost = proxyDeploymentCost + initializeCost;

      expect(totalProxyCost).toBeLessThan(lsp3AccountDeploymentCost);

      //   console.log("LSP3Account deployment cost: ", lsp3AccountDeploymentCost, "\n");
      //   console.log("proxy deployment cost: ", proxyDeploymentCost);
      //   console.log("initialize gas cost: ", initializeCost);
      //   console.log("--------------------------------------------------");
      //   console.log("total: ", totalProxyCost);
      //   console.log(
      //     "\n > Gas saved = ",
      //     lsp3AccountDeploymentCost - totalProxyCost,
      //     "(",
      //     (totalProxyCost * 100) / lsp3AccountDeploymentCost - 100,
      //     "%)"
      //   );
    });

    it("Should call the `initialize(...)` function and return the right owner", async () => {
      let currentOwner = await proxy.owner();
      console.log("currentOwner: ", currentOwner);
      // `initialize` function as constructor
      await proxy.initialize(owner.address);

      let newOwner = await proxy.owner();
      expect(newOwner).not.toEqual(currentOwner);
      expect(newOwner).toEqual(owner.address);
    });

    it("Should not allow to initialize twice", async () => {
      await expect(proxy.initialize("0xdead0dead0dead0dead0dead0dead0dead0dead0")).toBeRevertedWith(
        "Initializable: contract is already initialized"
      );
    });

    // test that account owner can transferOwnership, so
    // 1) transferOwnership call from owner should pass
    // 2) transferOwnership call from non-owner should fail
  });

  describe("> ERC165 (suported standards)", () => {
    it("Should support ERC165", async () => {
      let result = await proxy.callStatic.supportsInterface(ERC165_INTERFACE_ID);
      expect(result).toBeTruthy(); // "does not support interface `ERC165`"
    });

    it("Should support ERC725X", async () => {
      let result = await proxy.callStatic.supportsInterface(ERC725X_INTERFACE_ID);
      expect(result).toBeTruthy(); // "does not support interface `ERC725X`"
    });

    it("Should support ERC725Y", async () => {
      let result = await proxy.callStatic.supportsInterface(ERC725Y_INTERFACE_ID);
      expect(result).toBeTruthy(); // "does not support interface `ERC725Y`"
    });

    it("Should support ERC1271", async () => {
      let result = await proxy.callStatic.supportsInterface(ERC1271_INTERFACE_ID);
      expect(result).toBeTruthy(); // "does not support interface `ERC1271`"
    });

    it("Should support LSP1", async () => {
      let result = await proxy.callStatic.supportsInterface(LSP1_INTERFACE_ID);
      expect(result).toBeTruthy(); // "does not support interface `LSP1`"
    });

    it("Has SupportedStandardsERC725Account_KEY set to ERC725Account_VALUE", async () => {
      expect(await proxy.callStatic.getData(SupportedStandardsERC725Account_KEY)).toEqual(
        ERC725Account_VALUE
      );
    });
  });

  describe("> ERC1271 (signatures)", () => {
    it("Can verify signature from owner", async () => {
      // const proxy = await deployProxy(
      //   LSP3AccountInit,
      //   lsp3Account.address,
      //   DUMMY_SIGNER.address
      // );
      // await proxy.initialize(DUMMY_SIGNER.address);
      const dataToSign = "0xcafecafe";
      const messageHash = ethers.utils.hashMessage(dataToSign);
      const signature = await owner.signMessage(dataToSign);

      const result = await proxy.callStatic.isValidSignature(messageHash, signature);

      expect(result).toEqual(ERC1271_MAGIC_VALUE); // "Should define the signature as valid"
    });

    it("Should fail when verifying signature from not-owner", async () => {
      //   const proxy = await deployProxy(LSP3AccountInit, lsp3Account.address, owner);
      //   await proxy.initialize(owner);
      const dataToSign = "0xcafecafe";
      const messageHash = ethers.utils.hashMessage(dataToSign);
      const signature = await accounts[1].signMessage(dataToSign);

      const result = await proxy.callStatic.isValidSignature(messageHash, signature);
      expect(result).toEqual(ERC1271_FAIL_VALUE); // "Should define the signature as invalid"
    });
  });

  describe("> Testing storage", () => {
    let abiCoder = ethers.utils.defaultAbiCoder;
    let count = 1000000000;

    it("Create account", async () => {
      const owner = accounts[2];
      const newProxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const newProxyAccount = await new LSP3AccountInit__factory(owner).attach(newProxyAddress);
      await newProxyAccount.initialize(owner.address);

      expect(await newProxyAccount.callStatic.owner()).toEqual(owner.address);
    });

    it("Should `setData` in Key-Value store via proxy (item 1)", async () => {
      let key = abiCoder.encode(["bytes32"], [ethers.utils.hexZeroPad("0xcafe", 32)]);
      let value = "0xbeef";

      let initialValue = await proxy.callStatic.getData(key);
      expect(initialValue).toEqual("0x");
      //   "there should be no value initially set for key '0xcafe'"

      await proxy.setData(key, value);

      let result = await proxy.getData(key);

      expect(result).toEqual(value);
      //   "not the same value in storage for key '0xcafe'"
    });

    it("Store 32 bytes item 2", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
      );
      let value = "0x" + (count++).toString(16);
      await proxy.setData(key, value);

      expect(await proxy.callStatic.getData(key)).toEqual(value);
    });

    it("Store 32 bytes item 3", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
      );
      let value = "0x" + (count++).toString(16);
      await proxy.setData(key, value);

      expect(await proxy.callStatic.getData(key)).toEqual(value);
    });

    it("Store 32 bytes item 4", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
      );
      let value = "0x" + (count++).toString(16);
      await proxy.setData(key, value);

      expect(await proxy.callStatic.getData(key)).toEqual(value);
    });

    it("Store 32 bytes item 5", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
      );
      let value = "0x" + (count++).toString(16);
      await proxy.setData(key, value);

      expect(await proxy.callStatic.getData(key)).toEqual(value);
    });

    it("Store a long URL as bytes item 6", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
      );
      let value = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(
          "https://www.google.com/url?sa=i&url=https%3A%2F%2Ftwitter.com%2Ffeindura&psig=AOvVaw21YL9Wg3jSaEXMHyITcWDe&ust=1593272505347000&source=images&cd=vfe&ved=0CAIQjRxqFwoTCKD-guDon-oCFQAAAAAdAAAAABAD"
        )
      );
      await proxy.setData(key, value);

      expect(await proxy.getData(key)).toEqual(value);
    });

    it("Store 32 bytes item 7", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + count.toString(16), 32)]
      );
      let value = "0x" + count.toString(16);
      await proxy.setData(key, value);

      expect(await proxy.callStatic.getData(key)).toEqual(value);
    });

    it("dataCount should be 8", async () => {
      // 8 because the ERC725Type is already set by the ERC725Account implementation
      let result = await proxy.dataCount();
      expect(result.toNumber()).toEqual(8);
    });

    it("Update 32 bytes item 7", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [ethers.utils.hexZeroPad("0x" + count.toString(16), 32)]
      );

      let value = "0x" + count.toString(16);
      await proxy.setData(key, value);

      expect(await proxy.getData(key)).toEqual(value);
    });

    it("dataCount should remain 8 (after updating item 7)", async () => {
      let result = await proxy.callStatic.dataCount();
      expect(result.toNumber()).toEqual(8);
    });

    it("Store multiple 32 bytes item 9-11", async () => {
      let keys = [];
      let values = [];
      // increase
      count++;
      for (let i = 9; i <= 11; i++) {
        let key = abiCoder.encode(
          ["bytes32"],
          [ethers.utils.hexZeroPad("0x" + (count++).toString(16), 32)]
        );

        let value = "0x" + (count++).toString(16);
        keys.push(key);
        values.push(value);
      }
      await proxy.setDataMultiple(keys, values);
      let result = await proxy.callStatic.getDataMultiple(keys);
      expect(result).toEqual(values);
    });

    it("dataCount should be 11", async () => {
      let count = await proxy.callStatic.dataCount();
      expect(count.toNumber()).toEqual(11);

      let keys = await proxy.allDataKeys();
      expect(keys.length).toEqual(11);

      // console.log('Stored keys', keys)
    });
  });

  describe("> Interactions with Accounts contracts", () => {
    let abiCoder = ethers.utils.defaultAbiCoder;
    let provider = ethers.provider;

    let owner: SignerWithAddress;
    let newOwner: SignerWithAddress;
    let proxy: LSP3AccountInit;

    beforeEach(async () => {
      owner = accounts[3];
      newOwner = accounts[5];

      const newProxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      proxy = await new LSP3AccountInit__factory(owner).attach(newProxyAddress);
      proxy.initialize(owner.address, { gasLimit: 3_000_000 });
    });

    it("Upgrade ownership correctly", async () => {
      await proxy.transferOwnership(newOwner.address, {
        gasLimit: 3_000_000,
      });
      const idOwner = await proxy.callStatic.owner();

      expect(idOwner).toEqual(newOwner.address);
    });

    it("Refuse upgrades from non-onwer", async () => {
      await expect(proxy.connect(newOwner).transferOwnership(newOwner.address)).toBeRevertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Owner can set data", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [
          ethers.utils.hexZeroPad(
            ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data")),
            32
          ),
        ]
      );
      let data = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data"));

      await proxy.setData(key, data, { from: owner.address });

      let fetchedData = await proxy.getData(key);

      expect(data).toEqual(fetchedData);
    });

    it("Fails when non-owner sets data", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [
          ethers.utils.hexZeroPad(
            ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data")),
            32
          ),
        ]
      );
      let data = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data"));

      await expect(proxy.connect(newOwner).setData(key, data)).toBeRevertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Fails when non-owner sets data multiple", async () => {
      let key = abiCoder.encode(
        ["bytes32"],
        [
          ethers.utils.hexZeroPad(
            ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data")),
            32
          ),
        ]
      );
      let data = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Important Data"));

      await expect(proxy.connect(newOwner).setDataMultiple([key], [data])).toBeRevertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Allows owner to execute calls", async () => {
      const dest = accounts[6];
      const amount = ethers.utils.parseEther("10");
      const OPERATION_CALL = 0x0;

      await owner.sendTransaction({
        to: proxy.address,
        value: amount,
      });

      const destBalance = await provider.getBalance(dest.address);

      await proxy.execute(OPERATION_CALL, dest.address, amount, "0x00", {
        from: owner.address,
      });

      const finalBalance = await provider.getBalance(dest.address);

      expect(ethers.BigNumber.from(destBalance).add(amount)).toEqual(
        ethers.BigNumber.from(finalBalance)
      );
    });

    it("Fails with non-owner executing", async () => {
      const dest = accounts[6];
      const amount = ethers.utils.parseEther("10");
      const OPERATION_CALL = 0x0;

      // send money to the account
      await owner.sendTransaction({
        to: proxy.address,
        value: amount,
      });

      // try to move it away
      await expect(
        proxy.connect(newOwner).execute(OPERATION_CALL, dest.address, amount, "0x")
      ).toBeRevertedWith("Ownable: caller is not the owner");
    });

    it("Allows owner to execute create", async () => {
      const OPERATION_CREATE = 0x3;

      let transaction = await proxy.execute(
        OPERATION_CREATE,
        "0x0000000000000000000000000000000000000000",
        "0",
        "0x608060405234801561001057600080fd5b506040516105f93803806105f98339818101604052602081101561003357600080fd5b810190808051906020019092919050505080600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050610564806100956000396000f3fe60806040526004361061003f5760003560e01c806344c028fe1461004157806354f6127f146100fb578063749ebfb81461014a5780638da5cb5b1461018f575b005b34801561004d57600080fd5b506100f96004803603608081101561006457600080fd5b8101908080359060200190929190803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156100b557600080fd5b8201836020820111156100c757600080fd5b803590602001918460018302840111640100000000831117156100e957600080fd5b90919293919293905050506101e6565b005b34801561010757600080fd5b506101346004803603602081101561011e57600080fd5b81019080803590602001909291905050506103b7565b6040518082815260200191505060405180910390f35b34801561015657600080fd5b5061018d6004803603604081101561016d57600080fd5b8101908080359060200190929190803590602001909291905050506103d3565b005b34801561019b57600080fd5b506101a46104df565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146102a9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260128152602001807f6f6e6c792d6f776e65722d616c6c6f776564000000000000000000000000000081525060200191505060405180910390fd5b600085141561030757610301848484848080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f82011690508083019250505050505050610505565b506103b0565b60018514156103aa57600061035f83838080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f8201169050808301925050505050505061051d565b90508073ffffffffffffffffffffffffffffffffffffffff167fcf78cf0d6f3d8371e1075c69c492ab4ec5d8cf23a1a239b6a51a1d00be7ca31260405160405180910390a2506103af565b600080fd5b5b5050505050565b6000806000838152602001908152602001600020549050919050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610496576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260128152602001807f6f6e6c792d6f776e65722d616c6c6f776564000000000000000000000000000081525060200191505060405180910390fd5b806000808481526020019081526020016000208190555080827f35553580e4553c909abeb5764e842ce1f93c45f9f614bde2a2ca5f5b7b7dc0fb60405160405180910390a35050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600080600083516020850186885af190509392505050565b60008151602083016000f0905091905056fea265627a7a723158207fb9c8d804ca4e17aec99dbd7aab0a61583b56ebcbcb7e05589f97043968644364736f6c634300051100320000000000000000000000009501234ef8368466383d698c7fe7bd5ded85b4f6",
        {
          from: owner.address,
        }
      );

      let receipt = await transaction.wait();
      expect(receipt.events[1].event).toEqual("ContractCreated");
    });

    //   // TODO test delegateCall

    it("Allows owner to execute create2", async () => {
      const OPERATION_CREATE2 = 0x2;

      // deploy with added 32 bytes salt
      let transaction = await proxy.connect(owner).execute(
        OPERATION_CREATE2,
        "0x0000000000000000000000000000000000000000",
        "0",
        "0x608060405234801561001057600080fd5b506040516105f93803806105f98339818101604052602081101561003357600080fd5b810190808051906020019092919050505080600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050610564806100956000396000f3fe60806040526004361061003f5760003560e01c806344c028fe1461004157806354f6127f146100fb578063749ebfb81461014a5780638da5cb5b1461018f575b005b34801561004d57600080fd5b506100f96004803603608081101561006457600080fd5b8101908080359060200190929190803573ffffffffffffffffffffffffffffffffffffffff16906020019092919080359060200190929190803590602001906401000000008111156100b557600080fd5b8201836020820111156100c757600080fd5b803590602001918460018302840111640100000000831117156100e957600080fd5b90919293919293905050506101e6565b005b34801561010757600080fd5b506101346004803603602081101561011e57600080fd5b81019080803590602001909291905050506103b7565b6040518082815260200191505060405180910390f35b34801561015657600080fd5b5061018d6004803603604081101561016d57600080fd5b8101908080359060200190929190803590602001909291905050506103d3565b005b34801561019b57600080fd5b506101a46104df565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146102a9576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260128152602001807f6f6e6c792d6f776e65722d616c6c6f776564000000000000000000000000000081525060200191505060405180910390fd5b600085141561030757610301848484848080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f82011690508083019250505050505050610505565b506103b0565b60018514156103aa57600061035f83838080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f8201169050808301925050505050505061051d565b90508073ffffffffffffffffffffffffffffffffffffffff167fcf78cf0d6f3d8371e1075c69c492ab4ec5d8cf23a1a239b6a51a1d00be7ca31260405160405180910390a2506103af565b600080fd5b5b5050505050565b6000806000838152602001908152602001600020549050919050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610496576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260128152602001807f6f6e6c792d6f776e65722d616c6c6f776564000000000000000000000000000081525060200191505060405180910390fd5b806000808481526020019081526020016000208190555080827f35553580e4553c909abeb5764e842ce1f93c45f9f614bde2a2ca5f5b7b7dc0fb60405160405180910390a35050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600080600083516020850186885af190509392505050565b60008151602083016000f0905091905056fea265627a7a723158207fb9c8d804ca4e17aec99dbd7aab0a61583b56ebcbcb7e05589f97043968644364736f6c634300051100320000000000000000000000009501234ef8368466383d698c7fe7bd5ded85b4f6" +
          // 32 bytes salt
          "cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe",
        { from: owner.address, gasLimit: 3_000_000 }
      );

      let receipt = await transaction.wait();

      expect(receipt.events[1].event).toEqual("ContractCreated");
      //   expect(receipt.contractAddress).toEqual("0xc6aFf31a98cB525c6b849E0d76cc2693F4BbccD9");
    });

    it("Allow account to receive native tokens", async () => {
      const amount = ethers.utils.parseEther("10");

      // send money to the account
      await newOwner.sendTransaction({
        to: proxy.address,
        value: amount,
      });

      expect(await provider.getBalance(proxy.address)).toEqual(amount);
    });
  });
  describe("> Universal Receiver", () => {
    it("Call account and check for 'UniversalReceiver' event", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      // use the checker contract to call account
      let checker = await new UniversalReceiverTester__factory(owner).deploy();
      let transaction = await checker.callImplementationAndReturn(proxy.address, RANDOM_BYTES32);
      let receipt = await transaction.wait();

      // event should come from account
      expect(receipt.logs[0].address).toEqual(proxy.address);
      // event signature
      expect(receipt.logs[0].topics[0]).toEqual(
        "0x54b98940949b5ac0325c889c84db302d4e18faec431b48bdc81706bfe482cfbd"
      );
      // from
      expect(receipt.logs[0].topics[1]).toEqual(
        ethers.utils.hexZeroPad(checker.address.toLowerCase(), 32)
      );
      // typeId
      expect(receipt.logs[0].topics[2]).toEqual(RANDOM_BYTES32);
      // receivedData
      expect(receipt.logs[0].data).toEqual(
        "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000"
      );
    });

    it("Call account and check for 'ReceivedERC777' event in external account", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const externalUniversalReceiver = await new ExternalERC777UniversalReceiverTester__factory(
        owner
      ).deploy();

      // set account2 as new receiver for account1
      await proxyAccount.setData(UNIVERSALRECEIVER_KEY, externalUniversalReceiver.address, {
        from: owner.address,
      });

      // use the checker contract to call account
      let checker = await new UniversalReceiverTester__factory(owner).deploy();
      let transaction = await checker.callImplementationAndReturn(
        proxyAccount.address,
        ERC777TokensRecipient
      );
      let receipt = await transaction.wait();

      // event signature "event ReceivedERC777(address indexed token, address indexed _operator, address indexed _from, address _to, uint256 _amount)"
      // event should come from account externalUniversalReceiver
      expect(receipt.logs[0].address).toEqual(externalUniversalReceiver.address);
      // signature
      expect(receipt.logs[0].topics[0]).toEqual(
        "0xdc38539587ea4d67f9f649ad9269646bab26927bad175bdcdfdab5dd297d5e1c"
      );
      // "token" is the checker
      expect(receipt.logs[0].topics[1]).toEqual(
        ethers.utils.hexZeroPad(checker.address.toLowerCase(), 32)
      );
      // typeId
      // not present, as it would revert if not correct
      // receivedData
      expect(receipt.logs[0].data).toEqual(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
      );

      // event signature "event UniversalReceiver(address indexed from, bytes32 indexed typeId, bytes32 indexed returnedValue, bytes receivedData)"
      // event should come from account account
      expect(receipt.logs[1].address).toEqual(proxyAccount.address);
      // signature
      expect(receipt.logs[1].topics[0]).toEqual(
        "0x54b98940949b5ac0325c889c84db302d4e18faec431b48bdc81706bfe482cfbd"
      );
      // "from" is the checker
      expect(receipt.logs[1].topics[1]).toEqual(
        ethers.utils.hexZeroPad(checker.address.toLowerCase(), 32)
      );
      // typeId
      expect(receipt.logs[1].topics[2]).toEqual(ERC777TokensRecipient);
      // receivedData
      expect(receipt.logs[1].data).toEqual(
        "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000"
      );
    });

    it("Mint ERC777 and LSP4 to LSP3 account", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const universalReceiverDelegate = await new UniversalReceiverAddressStore__factory(
        owner
      ).deploy(owner.address);

      let tokenOwner = accounts[2];

      let erc777 = await new ERC777UniversalReceiver__factory(owner).deploy("MyToken", "TKN", [
        tokenOwner.address,
      ]);
      let digitalCertificate = await new LSP4DigitalCertificate__factory(owner).deploy(
        tokenOwner.address,
        "MyDigitalCloth",
        "DIGICLOTH01",
        []
      );

      let initialERC777Balance = await erc777.balanceOf(proxyAccount.address);
      let initialdigitalCertificateBalance = await digitalCertificate.balanceOf(
        proxyAccount.address
      );
      expect(ethers.BigNumber.from(initialERC777Balance).toNumber()).toEqual(0);
      expect(ethers.BigNumber.from(initialdigitalCertificateBalance).toNumber()).toEqual(0);

      await erc777.mint(proxyAccount.address, "50", { from: tokenOwner.address });
      let newERC777Balance = await erc777.balanceOf(proxyAccount.address);
      expect(ethers.BigNumber.from(newERC777Balance).toNumber()).toEqual(50);

      await digitalCertificate.mint(proxyAccount.address, "50", { from: tokenOwner.address });
      let newDigitalCertificateBalance = await digitalCertificate.balanceOf(proxyAccount.address);
      expect(ethers.BigNumber.from(newDigitalCertificateBalance).toNumber()).toEqual(50);
    });

    it("Transfer ERC777 and LSP4 to LSP3 account", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const universalReceiverDelegate = await new UniversalReceiverAddressStore__factory(
        owner
      ).deploy(proxyAccount.address);

      let tokenOwner = accounts[3];

      let erc777 = await new ERC777UniversalReceiver__factory(owner).deploy("MyToken", "TKN", [
        tokenOwner.address,
      ]);
      let digitalCertificate = await new LSP4DigitalCertificate__factory(owner).deploy(
        tokenOwner.address,
        "MyDigitalCloth",
        "DIGICLOTH01",
        []
      );

      await erc777.connect(tokenOwner).mint(tokenOwner.address, "100");
      await digitalCertificate.connect(tokenOwner).mint(tokenOwner.address, "100");

      let initialERC777Balance = await erc777.callStatic.balanceOf(proxyAccount.address);
      let initialdigitalCertificateBalance = await digitalCertificate.callStatic.balanceOf(
        proxyAccount.address
      );

      expect(ethers.BigNumber.from(initialERC777Balance).toNumber()).toEqual(0);
      expect(ethers.BigNumber.from(initialdigitalCertificateBalance).toNumber()).toEqual(0);

      await erc777.connect(tokenOwner).send(proxyAccount.address, "50", "0x");
      await erc777.connect(tokenOwner).transfer(proxyAccount.address, "50");
      await digitalCertificate.connect(tokenOwner).send(proxyAccount.address, "50", "0x");
      await digitalCertificate.connect(tokenOwner).transfer(proxyAccount.address, "50");

      let newERC777Balance = await erc777.callStatic.balanceOf(proxyAccount.address);
      let newdigitalCertificateBalance = await digitalCertificate.callStatic.balanceOf(
        proxyAccount.address
      );
      expect(ethers.BigNumber.from(newERC777Balance).toNumber()).toEqual(100);
      expect(ethers.BigNumber.from(newdigitalCertificateBalance).toNumber()).toEqual(100);
    });

    it("Mint ERC777 and LSP4 to LSP3 account and delegate to UniversalReceiverAddressStore", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const universalReceiverDelegate = await new UniversalReceiverAddressStore__factory(
        owner
      ).deploy(proxyAccount.address);

      // set account2 as new receiver for account1
      await proxyAccount.setData(UNIVERSALRECEIVER_KEY, universalReceiverDelegate.address, {
        from: owner.address,
      });

      let tokenOwner = accounts[2].address;

      let erc777 = await new ERC777UniversalReceiver__factory(owner).deploy("MyToken", "TKN", [
        tokenOwner,
      ]);
      let digitalCertificate = await new LSP4DigitalCertificate__factory(owner).deploy(
        tokenOwner,
        "MyDigitalCloth",
        "DIGICLOTH01",
        []
      );

      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN(0);
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN(0);

      await erc777.mint(proxyAccount.address, "50", { from: tokenOwner });
      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN(50);

      await digitalCertificate.mint(proxyAccount.address, "50", { from: tokenOwner });
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN(50);

      expect(await universalReceiverDelegate.containsAddress(erc777.address)).toBeTruthy();
      expect(
        await universalReceiverDelegate.containsAddress(digitalCertificate.address)
      ).toBeTruthy();
    });

    it("Transfer ERC777 and LSP4 from LSP3 account with delegate to UniversalReceiverAddressStore", async () => {
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const universalReceiverDelegate = await new UniversalReceiverAddressStore__factory(
        owner
      ).deploy(proxyAccount.address);

      // set account2 as new receiver for account1
      await proxyAccount.setData(UNIVERSALRECEIVER_KEY, universalReceiverDelegate.address, {
        from: owner.address,
      });

      let tokenOwner = accounts[2].address;

      let erc777 = await new ERC777UniversalReceiver__factory(owner).deploy("MyToken", "TKN", [
        tokenOwner,
      ]);
      let digitalCertificate = await new LSP4DigitalCertificate__factory(owner).deploy(
        tokenOwner,
        "MyDigitalCloth",
        "DIGICLOTH01",
        []
      );

      await erc777.mint(tokenOwner, "100", { from: tokenOwner });
      await digitalCertificate.mint(tokenOwner, "100", { from: tokenOwner });

      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN(0);
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN(0);

      await erc777.send(proxyAccount.address, "50", "0x", { from: tokenOwner });
      await erc777.transfer(proxyAccount.address, "50", { from: tokenOwner });
      await digitalCertificate.send(proxyAccount.address, "50", "0x", { from: tokenOwner });
      await digitalCertificate.transfer(proxyAccount.address, "50", { from: tokenOwner });

      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN("100");
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN("100");

      expect(await universalReceiverDelegate.containsAddress(erc777.address)).toBeTruthy();
      expect(
        await universalReceiverDelegate.containsAddress(digitalCertificate.address)
      ).toBeTruthy();
    });

    it("Transfer from ERC777 and LSP4 to account and delegate to UniversalReceiverAddressStore", async () => {
      const OPERATION_CALL = 0x0;
      const owner = accounts[2];

      const proxyAddress = await deployLSP3Proxy(lsp3Account.address, owner);
      const proxyAccount = await new LSP3AccountInit__factory(owner).attach(proxyAddress);
      await proxyAccount.initialize(owner.address);

      const universalReceiverDelegate = await new UniversalReceiverAddressStore__factory(
        owner
      ).deploy(proxyAccount.address);

      // set account2 as new receiver for account1
      await proxyAccount.setData(UNIVERSALRECEIVER_KEY, universalReceiverDelegate.address, {
        from: owner.address,
      });

      let tokenOwner = accounts[3];

      let erc777 = await new ERC777UniversalReceiver__factory(owner).deploy("MyToken", "TKN", [
        tokenOwner.address,
      ]);
      let digitalCertificate = await new LSP4DigitalCertificate__factory(owner).deploy(
        tokenOwner.address,
        "MyDigitalCloth",
        "DIGICLOTH01",
        []
      );

      await erc777.connect(tokenOwner).mint(proxyAccount.address, "100");
      await digitalCertificate.connect(tokenOwner).mint(proxyAccount.address, "100");

      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN(100);
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN(100);

      let abi;
      abi = erc777.interface.encodeFunctionData("send", [accounts[4].address, "50", "0x"]);
      await proxyAccount.execute(OPERATION_CALL, erc777.address, 0, abi, { gasLimit: 3_000_000 });
      abi = erc777.interface.encodeFunctionData("transfer", [accounts[4].address, "50"]);
      await proxyAccount.execute(OPERATION_CALL, erc777.address, 0, abi, { gasLimit: 3_000_000 });

      abi = digitalCertificate.interface.encodeFunctionData("send", [
        accounts[4].address,
        "50",
        "0x",
      ]);
      await proxyAccount.execute(OPERATION_CALL, digitalCertificate.address, 0, abi, {
        gasLimit: 3_000_000,
      });
      abi = digitalCertificate.interface.encodeFunctionData("transfer", [
        accounts[4].address,
        "50",
      ]);
      await proxyAccount.execute(OPERATION_CALL, digitalCertificate.address, 0, abi, {
        gasLimit: 3_000_000,
      });

      expect(await erc777.balanceOf(proxyAccount.address)).toEqBN(0);
      expect(await digitalCertificate.balanceOf(proxyAccount.address)).toEqBN(0);

      expect(await erc777.balanceOf(accounts[4].address)).toEqBN(100);
      expect(await digitalCertificate.balanceOf(accounts[4].address)).toEqBN(100);
    });
  });
});
