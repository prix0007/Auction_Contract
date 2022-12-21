import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { AuctionContract } from "../typechain-types/contracts/Auction.sol";
import { USDollarCoin } from "../typechain-types/contracts/ERC20.sol";
import { CryptoKitties } from "../typechain-types/contracts/ERC721.sol";
import { ethers } from "hardhat";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    describe("Auction Functions", async () => {
      beforeEach(async () => {
        const tx1 = await auctionContract.setAllowedToken(erc20Token.address);
        await tx1.wait();

        const tx2 = await cryptoKitties.safeMint(
          accounts[0].address,
          "qwe1234"
        );
        await tx2.wait();

        const tx3 = await cryptoKitties.safeMint(
          accounts[0].address,
          "qwe5678"
        );
        await tx3.wait();

        // Need to allow auction contract for transfers
        const tx4 = await cryptoKitties.setApprovalForAll(
          auctionContract.address,
          true
        );
        await tx4.wait();

        const tx7 = await erc20Token.transfer(
          accounts[2].address,
          ethers.utils.parseUnits("30", 18)
        );
        await tx7.wait();

        const tx8 = await erc20Token
          .connect(accounts[0])
          .increaseAllowance(
            auctionContract.address,
            ethers.utils.parseUnits("20", 18)
          );
        await tx8.wait();

        const tx9 = await erc20Token
          .connect(accounts[2])
          .increaseAllowance(
            auctionContract.address,
            ethers.utils.parseUnits("20", 18)
          );
        await tx9.wait();

        const tx6 = await cryptoKitties
          .connect(accounts[0])
          ["safeTransferFrom(address,address,uint256)"](
            accounts[0].address,
            accounts[1].address,
            1
          );
        await tx6.wait();

        // Need to allow auction contract for transfers
        const tx5 = await cryptoKitties
          .connect(accounts[1])
          .setApprovalForAll(auctionContract.address, true);
        await tx5.wait();
      });

      it("Should create Native Auction  and bid and complete", async () => {
        const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;

        const tx1 = await auctionContract.createAuctionNative(
          cryptoKitties.address,
          0,
          ethers.utils.parseUnits("0.1", 18),
          parseInt(timeStamp + 5)
        );

        await tx1.wait();

        const auction1 = await auctionContract.auctions(0);
        expect(auction1.owner).to.be.eq(accounts[0].address);

        // Bid on auction
        const tx2 = await auctionContract
          .connect(accounts[1])
          .bidAuction(0, ethers.utils.parseUnits("0.2", 18), {
            value: ethers.utils.parseUnits("0.2", 18),
          });
        await tx2.wait();

        const bid1 = await auctionContract.bids(0, 0);
        expect(bid1.bidder).to.be.eq(accounts[1].address);

        const tx3 = await auctionContract
          .connect(accounts[2])
          .bidAuction(0, ethers.utils.parseUnits("0.3", 18), {
            value: ethers.utils.parseUnits("0.3", 18),
          });
        await tx3.wait();

        const bid2 = await auctionContract.bids(0, 1);
        expect(bid2.bidder).to.be.eq(accounts[2].address);

        await delay(5000);

        const balanceBefore = await ethers.provider.getBalance(
          accounts[0].address
        );
        // Complete Auction
        const tx4 = await auctionContract
          .connect(accounts[0])
          .completeAuction(0);
        const txReceipt = await tx4.wait();

        const bid22 = await auctionContract.bids(0, 1);
        expect(bid22.state).to.be.eq(1);

        // Test of balance increase in account1
        const balanceAfter = await ethers.provider.getBalance(
          accounts[0].address
        );
        const balanceDiff = ethers.BigNumber.from(balanceAfter.toString()).sub(
          ethers.BigNumber.from(balanceBefore.toString())
        );

        expect(txReceipt.gasUsed.mul(tx4.gasPrice).add(balanceDiff)).to.be.eq(
          ethers.utils.parseUnits("0.3", 18)
        );

        const loserAccountBalanceBefore = await ethers.provider.getBalance(
          accounts[1].address
        );
        const tx5 = await auctionContract
          .connect(accounts[1])
          .claimRefundBid(0, 0);
        await tx5.wait();

        const loserAccountBalanceAfter = await ethers.provider.getBalance(
          accounts[1].address
        );

        expect(loserAccountBalanceBefore).to.be.lt(loserAccountBalanceAfter);
      });

      it("Should create ERC20 Auction and bid and complete", async () => {
        const timeStamp = (await ethers.provider.getBlock("latest")).timestamp;

        const tx1 = await auctionContract
          .connect(accounts[1])
          .createAuctionToken(
            cryptoKitties.address,
            1,
            ethers.utils.parseUnits("0.1", 18),
            erc20Token.address,
            parseInt(timeStamp + 5)
          );

        await tx1.wait();

        const auction1 = await auctionContract.auctions(0);
        expect(auction1.owner).to.be.eq(accounts[1].address);

        // Bid on auction
        const tx2 = await auctionContract
          .connect(accounts[0])
          .bidAuction(0, ethers.utils.parseUnits("0.2", 18));
        await tx2.wait();

        const bid1 = await auctionContract.bids(0, 0);
        expect(bid1.bidder).to.be.eq(accounts[0].address);

        const tx3 = await auctionContract
          .connect(accounts[2])
          .bidAuction(0, ethers.utils.parseUnits("0.3", 18));
        await tx3.wait();

        const bid2 = await auctionContract.bids(0, 1);
        expect(bid2.bidder).to.be.eq(accounts[2].address);

        const contractTokenBalane = await erc20Token.balanceOf(
          auctionContract.address
        );

        await delay(5000);

        // Complete Auction
        const tx4 = await auctionContract
          .connect(accounts[1])
          .completeAuction(0);
        const txReceipt = await tx4.wait();

        const bid22 = await auctionContract.bids(0, 1);
        expect(bid22.state).to.be.eq(1);

        // Test of balance increase in account1
        const tokenBalanceAcc1 = await erc20Token.balanceOf(
          accounts[1].address
        );
        expect(tokenBalanceAcc1).to.be.eq(ethers.utils.parseUnits("0.3", 18));

        const loserAccountBalanceBefore = await erc20Token.balanceOf(
          accounts[0].address
        );

        const tx5 = await auctionContract
          .connect(accounts[0])
          .claimRefundBid(0, 0);
        await tx5.wait();

        const loserAccountBalanceAfter = await erc20Token.balanceOf(
          accounts[0].address
        );

        expect(loserAccountBalanceBefore).to.be.lt(loserAccountBalanceAfter);

        const bid12 = await auctionContract.bids(0, 0);
        expect(bid12.state).to.be.eq(2);
      });
    });
  });
});
