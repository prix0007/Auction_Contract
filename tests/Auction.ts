import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { AuctionContract } from "../typechain-types/contracts/Auction.sol";
import { USDollarCoin } from "../typechain-types/contracts/ERC20.sol";
import { CryptoKitties } from "../typechain-types/contracts/ERC721.sol";
import { ethers } from "hardhat";

describe("Auction Contract", () => {
  let auctionContract: AuctionContract;
  let erc20Token: USDollarCoin;
  let cryptoKitties: CryptoKitties;

  let accounts: SignerWithAddress[];

  beforeEach(async () => {
    accounts = await ethers.getSigners();

    const c = await ethers.getContractFactory("USDollarCoin");
    erc20Token = (await c.deploy()) as USDollarCoin;
    await erc20Token.deployed();

    const d = await ethers.getContractFactory("CryptoKitties");
    cryptoKitties = (await d.deploy()) as CryptoKitties;
    await cryptoKitties.deployed();

    const e = await ethers.getContractFactory("AuctionContract");
    auctionContract = (await e.deploy()) as AuctionContract;
    await auctionContract.deployed();
  });

  describe("Auction Contract Tests", () => {
    it("Should able to set allowedToken", async () => {
      const isAllowedBefore = await auctionContract.allowedTokens(
        erc20Token.address
      );
      expect(isAllowedBefore).to.be.false;

      const tx1 = await auctionContract.setAllowedToken(erc20Token.address);
      await tx1.wait();

      const isAllowedAfter = await auctionContract.allowedTokens(
        erc20Token.address
      );
      expect(isAllowedAfter).to.be.true;
    });
  });
});
