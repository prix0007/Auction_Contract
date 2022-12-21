// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract AuctionContract is AccessControl, IERC721Receiver {
    using ERC165Checker for address;
    using Counters for Counters.Counter;

    Counters.Counter private _auctionIdCounter;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    }

    /**
     * Utility Functions
     */
    function isERC721(address _nftAddress) internal view returns (bool) {
        return _nftAddress.supportsInterface(IID_IERC721);
    }

    /// Structures

    enum TypeOfAuction {
        NATIVE,
        TOKEN
    }

    enum BidState {
        ACTIVE,
        WINNER,
        CLAIMED
    }

    struct Bid {
        address bidder;
        uint256 amount;
        BidState state;
    }

    struct Auction {
        address owner;
        uint256 startingPrice;
        address tokenAddress;
        uint256 nftTokenId;
        address nftAddress;
        TypeOfAuction typeOfAuction;
        uint64 endTime;
    }

    // State Variables
    mapping(address => bool) public allowedTokens;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(uint256 => Bid)) public bids;
    mapping(uint256 => uint64) public auctionIdToBidsCounter;

    // Events
    event AllowedTokenAdded(address TokenAddress, address AdminAddress);
    event RevokedToken(address TokenAddress, address AdminAddress);
    event AuctionCreated(
        address owner,
        uint256 startingPrice,
        address tokenAddress,
        uint256 nftTokenId,
        address nftAddress,
        TypeOfAuction typeOfAuction,
        uint64 endTime
    );
    event AuctionCompleted(
        uint256 auctionId,
        address owner,
        address winner,
        address nftAddress,
        uint256 nftTokenId,
        uint256 amount
    );

    event BidCreated(uint256 auctionId, address bidder, uint256 amount);
    event BidReClaimed(uint256 auctionId, address bidder, uint256 amount);

    // Mutate State Functions
    function setAllowedToken(
        address _erc20Token
    ) external onlyRole(ADMIN_ROLE) {
        allowedTokens[_erc20Token] = true;

        emit AllowedTokenAdded(_erc20Token, msg.sender);
    }

    function revokeAllowedToken(
        address _erc20Token
    ) external onlyRole(ADMIN_ROLE) {
        allowedTokens[_erc20Token] = false;

        emit RevokedToken(_erc20Token, msg.sender);
    }

    function createAuctionNative(
        address _nftAddress,
        uint256 _nftTokenId,
        uint256 _startingPrice,
        uint64 _endTime
    ) external {
        require(
            isERC721(_nftAddress),
            "NFT Address Supplied doesn't not implement ERC721 Interface"
        );

        require(
            _endTime > block.timestamp,
            "endTime must be greater than current block.timestamp"
        );

        bool success = IERC721(_nftAddress).isApprovedForAll(
            msg.sender,
            address(this)
        );
        require(success, "Auction Contract is not Approved.");

        // Transfer Token to this Contract
        IERC721(_nftAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _nftTokenId
        );

        _createAuction(
            msg.sender,
            _startingPrice,
            address(0),
            _nftTokenId,
            _nftAddress,
            TypeOfAuction.NATIVE,
            _endTime
        );
    }

    function createAuctionToken(
        address _nftAddress,
        uint256 _nftTokenId,
        uint256 _startingPrice,
        address _erc20Token,
        uint64 _endTime
    ) external {
        require(
            allowedTokens[_erc20Token],
            "ERC20 Token not allowed to Participate."
        );

        require(
            _endTime > block.timestamp,
            "endTime must be greater than current block.timestamp"
        );

        require(
            isERC721(_nftAddress),
            "NFT Address Supplied doesn't not implement ERC721 Interface"
        );

        bool success = IERC721(_nftAddress).isApprovedForAll(
            msg.sender,
            address(this)
        );
        require(success, "Auction Contract is not Approved.");

        // Transfer Token to this Contract
        IERC721(_nftAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _nftTokenId
        );

        _createAuction(
            msg.sender,
            _startingPrice,
            _erc20Token,
            _nftTokenId,
            _nftAddress,
            TypeOfAuction.TOKEN,
            _endTime
        );
    }

    function bidAuction(uint256 _auctionId, uint256 _amount) external payable {
        Auction memory auction = auctions[_auctionId];

        require(auction.owner != address(0), "Auction doesn't exists yet !!");

        require(
            auction.startingPrice <= _amount,
            "Can't bid less than the starting price!!"
        );

        require(
            auction.endTime > block.timestamp,
            "Auction is expired!! can't bid"
        );

        // Transfer ERC20 Tokens to this contract
        // or
        // if native check attached value;

        if (auction.typeOfAuction == TypeOfAuction.NATIVE) {
            require(
                msg.value == _amount,
                "Attached value is less than bidding amount!!"
            );

            _createBid(_auctionId, msg.sender, _amount);
        }

        if (auction.typeOfAuction == TypeOfAuction.TOKEN) {
            uint256 allowanceTokens = IERC20(auction.tokenAddress).allowance(
                msg.sender,
                address(this)
            );
            require(
                allowanceTokens >= _amount,
                "Not enough Allowance to Auctions contract"
            );

            bool success = IERC20(auction.tokenAddress).transferFrom(
                msg.sender,
                address(this),
                _amount
            );
            require(
                success,
                "Failed to transfer ERC20 Tokens to Auction Contract"
            );

            _createBid(_auctionId, msg.sender, _amount);
        }
    }

    function completeAuction(uint256 _auctionId) external {
        Auction memory auction = auctions[_auctionId];

        require(auction.owner != address(0), "Auction doesn't exists yet !!");
        require(
            auction.endTime < block.timestamp,
            "Auction is not expired yet!!"
        );

        require(
            auction.owner == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "You are not owner for auction"
        );

        uint64 totalBids = auctionIdToBidsCounter[_auctionId];

        Bid memory highestBid = bids[_auctionId][0];
        uint64 winningBid = 0;

        // EXPENSIVE LOOP AHEAD
        for (uint64 idx = 0; idx < totalBids; ++idx) {
            Bid memory tempBid = bids[_auctionId][idx];
            if (highestBid.amount < tempBid.amount) {
                highestBid = tempBid;
                winningBid = idx;
            }
        }

        if (auction.typeOfAuction == TypeOfAuction.NATIVE) {
            // Transfer NFT to the Winner
            IERC721(auction.nftAddress).safeTransferFrom(
                address(this),
                highestBid.bidder,
                auction.nftTokenId
            );

            // Transfer Amount to the auction owner
            payable(auction.owner).transfer(highestBid.amount);

            // Mark Bid as WINNER
            highestBid.state = BidState.WINNER;
            bids[_auctionId][winningBid] = highestBid;

            emit AuctionCompleted(
                _auctionId,
                auction.owner,
                highestBid.bidder,
                auction.nftAddress,
                auction.nftTokenId,
                highestBid.amount
            );
        }

        if (auction.typeOfAuction == TypeOfAuction.TOKEN) {
            // Transfer NFT to the Winner
            IERC721(auction.nftAddress).safeTransferFrom(
                address(this),
                highestBid.bidder,
                auction.nftTokenId
            );

            // Transfer ERC20 Tokens to the Auction Owner
            bool success = IERC20(auction.tokenAddress).transfer(
                auction.owner,
                highestBid.amount
            );

            require(success, "Failed to Transfer ERC20 Tokens!!");

            // Mark Bid as WINNER
            highestBid.state = BidState.WINNER;
            bids[_auctionId][winningBid] = highestBid;

            emit AuctionCompleted(
                _auctionId,
                auction.owner,
                highestBid.bidder,
                auction.nftAddress,
                auction.nftTokenId,
                highestBid.amount
            );
        }
    }

    function claimRefundBid(uint256 _auctionId, uint256 _bidId) external {
        // Make sure status is active
        // Make sure auction has ended
        Auction memory auction = auctions[_auctionId];

        require(auction.owner != address(0), "Auction doesn't exists yet !!");
        require(
            auction.endTime < block.timestamp,
            "Auction is not expired yet!!"
        );

        Bid memory bid = bids[_auctionId][_bidId];

        require(bid.bidder == msg.sender, "You are not bidder for this bid");
        require(bid.state == BidState.ACTIVE, "Bid is not Active");

        // Transfer Bid Amount
        if (auction.typeOfAuction == TypeOfAuction.NATIVE) {
            // Transfer NATIVE Currency
            payable(bid.bidder).transfer(bid.amount);
        }

        if (auction.typeOfAuction == TypeOfAuction.TOKEN) {
            // Transfer ERC20 Tokens
            bool success = IERC20(auction.tokenAddress).transfer(
                bid.bidder,
                bid.amount
            );
            require(success, "Failed to transfer ERC20 Tokens");
        }

        bid.state = BidState.CLAIMED;
        bids[_auctionId][_bidId] = bid;

        emit BidReClaimed(_auctionId, bid.bidder, bid.amount);
    }

    /**
     * Internal Functions
     */

    function _createAuction(
        address _owner,
        uint256 _startingPrice,
        address _erc20Token,
        uint256 _nftTokenId,
        address _nftAddress,
        TypeOfAuction typeOfAuction,
        uint64 _endTime
    ) internal {
        uint256 auctionId = _auctionIdCounter.current();
        _auctionIdCounter.increment();
        Auction memory newAuction = Auction(
            _owner,
            _startingPrice,
            _erc20Token,
            _nftTokenId,
            _nftAddress,
            typeOfAuction,
            _endTime
        );

        auctions[auctionId] = newAuction;

        emit AuctionCreated(
            msg.sender,
            _startingPrice,
            _erc20Token,
            _nftTokenId,
            _nftAddress,
            typeOfAuction,
            _endTime
        );
    }

    function _createBid(
        uint256 _auctionId,
        address _bidder,
        uint256 _amount
    ) internal {
        uint64 lastAuctionBidIndex = auctionIdToBidsCounter[_auctionId];

        Bid memory bid = Bid(_bidder, _amount, BidState.ACTIVE);
        bids[_auctionId][lastAuctionBidIndex] = bid;

        auctionIdToBidsCounter[_auctionId] = lastAuctionBidIndex + 1;

        emit BidCreated(_auctionId, _bidder, _amount);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
