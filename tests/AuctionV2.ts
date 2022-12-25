import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { AuctionContractV2 } from "../typechain-types/contracts/AuctionV2.sol";
import { USDollarCoin } from "../typechain-types/contracts/ERC20.sol";
import { CryptoKitties } from "../typechain-types/contracts/ERC721.sol";
import { ethers } from "hardhat";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Auction V2 Contract", () => {
  let auctionContract: AuctionContractV2;
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

    const e = await ethers.getContractFactory("AuctionContractV2");
    auctionContract = (await e.deploy()) as AuctionContractV2;
    await auctionContract.deployed();
  });

  describe("Auction V2 Contract Tests", () => {
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

        const bid1 = await auctionContract.winningBid(0);
        expect(bid1.bidder).to.be.eq(accounts[1].address);

        const acc1BalanceBefore = await ethers.provider.getBalance(
          accounts[1].address
        );

        // Cross Over Bid More on Previous Bid
        const tx3 = await auctionContract
          .connect(accounts[2])
          .bidAuction(0, ethers.utils.parseUnits("0.3", 18), {
            value: ethers.utils.parseUnits("0.3", 18),
          });
        await tx3.wait();

        // Expect Account 1 to have Native Token Returned
        const acc1BalanceAfter = await ethers.provider.getBalance(
          accounts[1].address
        );

        expect(
          ethers.BigNumber.from(acc1BalanceAfter).sub(
            ethers.BigNumber.from(acc1BalanceBefore)
          )
        ).to.be.eq(ethers.utils.parseUnits("0.2", 18));

        const bid2 = await auctionContract.winningBid(0);
        expect(bid2.bidder).to.be.eq(accounts[2].address);

        await delay(5000);

        const acc0balanceBefore = await ethers.provider.getBalance(
          accounts[0].address
        );
        // Complete Auction
        const tx4 = await auctionContract
          .connect(accounts[0])
          .completeAuction(0);
        const txReceipt = await tx4.wait();

        const bid22 = await auctionContract.winningBid(0);
        expect(bid22.state).to.be.eq(1);

        // Test of balance increase in account1
        const acc0balanceAfter = await ethers.provider.getBalance(
          accounts[0].address
        );
        const balanceDiff = ethers.BigNumber.from(
          acc0balanceAfter.toString()
        ).sub(ethers.BigNumber.from(acc0balanceBefore.toString()));

        expect(txReceipt.gasUsed.mul(tx4.gasPrice).add(balanceDiff)).to.be.eq(
          ethers.utils.parseUnits("0.3", 18)
        );

        const ownerOfNft = await cryptoKitties.ownerOf(0);
        expect(ownerOfNft).to.be.eq(accounts[2].address);
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

        const acc0ERC20TokenBalanceBefore = ethers.BigNumber.from(
          await erc20Token.balanceOf(accounts[0].address)
        );

        const bid1 = await auctionContract.winningBid(0);
        expect(bid1.bidder).to.be.eq(accounts[0].address);

        // Cross Bid Higher
        const tx3 = await auctionContract
          .connect(accounts[2])
          .bidAuction(0, ethers.utils.parseUnits("0.3", 18));
        await tx3.wait();

        const bid2 = await auctionContract.winningBid(0);
        expect(bid2.bidder).to.be.eq(accounts[2].address);

        const acc0ERC20TokenBalanceAfter = ethers.BigNumber.from(
          await erc20Token.balanceOf(accounts[0].address)
        );

        expect(
          acc0ERC20TokenBalanceAfter.sub(acc0ERC20TokenBalanceBefore)
        ).to.be.eq(ethers.utils.parseUnits("0.2", 18));

        const contractTokenBalane2 = await erc20Token.balanceOf(
          auctionContract.address
        );

        // const winningBig = await auctionContract.winningBid(0);
        // console.log({winningBig});

        await delay(5000);

        // Complete Auction
        const tx4 = await auctionContract
          .connect(accounts[1])
          .completeAuction(0);
        const txReceipt = await tx4.wait();

        const bid22 = await auctionContract.winningBid(0);
        expect(bid22.state).to.be.eq(1);

        // Test of balance increase in account1
        const tokenBalanceAcc1 = await erc20Token.balanceOf(
          accounts[1].address
        );
        expect(tokenBalanceAcc1).to.be.eq(ethers.utils.parseUnits("0.3", 18));

        const ownerOfNft = await cryptoKitties.ownerOf(1);
        expect(ownerOfNft).to.be.eq(accounts[2].address);
      });
    });
  });
});
