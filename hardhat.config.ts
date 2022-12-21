import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-storage-layout');

const {
  ALCHEMY_GOERLI_HTTP,
  ALCHEMY_GOERLI_WS,
  ALCHEMY_GOERLI_API_KEY,
  GOERLI_PRIVATE_KEY,
  ALCHEMY_POLYGON_TESTNET_HTTP,
  ALCHEMY_POLYGON_TESTNET_WS,
  ALCHEMY_POLYGON_API_KEY,
  POLYGON_TESTNET_PRIVATE_KEY,
  ZKEVM_TESTNET_POLYGON_HTTP,
  ZKEVM_TESTNET_PRIVATE_WALLET
} = process.env;
const { ETHERSCAN_API_KEY, ETHERSCAN_API_KEY_POLYSCAN } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  defaultNetwork: "hardhat",
  paths: {
    tests: "tests",
  },
  networks: {
    hardhat: {},
    goerli: {
      url: ALCHEMY_GOERLI_HTTP,
      accounts: [`0x${GOERLI_PRIVATE_KEY}`],
    },
    maticmum: {
      url: ALCHEMY_POLYGON_TESTNET_HTTP,
      accounts: [`0x${POLYGON_TESTNET_PRIVATE_KEY}`],
    },
    zkevm: {
      url: ZKEVM_TESTNET_POLYGON_HTTP,
      accounts: [`0x${ZKEVM_TESTNET_PRIVATE_WALLET}`]
    }
  },
  etherscan: {
    apiKey: {
      goerli: ETHERSCAN_API_KEY || "",
      polygonMumbai: ETHERSCAN_API_KEY_POLYSCAN || "" 
    },
  },
};

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

export default config;
