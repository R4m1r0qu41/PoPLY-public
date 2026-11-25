// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CreditEscrow, Owned } from "./Common.sol";
import {
    IERC721,
    IERC2981,
    IPoPLYCharacter,
    ICharacterLock,
    IStateRegistry
} from "./interfaces/IPoPLY.sol";

contract Marketplace is CreditEscrow {
    error NotCharacterOwner();
    error CharacterLocked();
    error InvalidPrice();
    error InvalidPayment();
    error ListingUnavailable();
    error NotEligibleForListing();

    struct Listing {
        address characterContract;
        uint256 tokenId;
        address seller;
        uint96 price;
        uint64 deadline;
        bool open;
    }

    ICharacterLock public immutable licenseManager;
    IStateRegistry public immutable stateRegistry;
    uint256 public nextListingId = 1;

    // #9: a character must clear all three bars before it can be listed. Meeting them auto-allows
    // the listing (no separate allowlist). Owner-tunable per deployment; defaults below.
    uint64 public minListingAgeSeconds = 30 days;
    uint64 public minListingPlayTimeSeconds = 30 hours;
    uint16 public minListingPoPL = 3;

    mapping(uint256 listingId => Listing listing) public listings;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed characterContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price,
        uint64 deadline
    );
    event ListingCancelled(uint256 indexed listingId);
    event CharacterPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 price,
        address royaltyReceiver,
        uint256 royaltyAmount,
        uint256 protocolFee
    );
    event ListingEligibilityConfigured(
        uint64 minAgeSeconds, uint64 minPlayTimeSeconds, uint16 minPoPL
    );

    constructor(
        address initialOwner,
        address lockManager,
        address registry,
        address initialFeeRecipient,
        uint16 initialFeeBps
    ) Owned(initialOwner) {
        if (lockManager == address(0) || registry == address(0)) {
            revert ZeroAddress();
        }
        licenseManager = ICharacterLock(lockManager);
        stateRegistry = IStateRegistry(registry);
        _configureFee(initialFeeRecipient, initialFeeBps);
    }

    function configureListingEligibility(
        uint64 minAgeSeconds,
        uint64 minPlayTimeSeconds,
        uint16 minPoPL
    ) external onlyOwner {
        minListingAgeSeconds = minAgeSeconds;
        minListingPlayTimeSeconds = minPlayTimeSeconds;
        minListingPoPL = minPoPL;
        emit ListingEligibilityConfigured(minAgeSeconds, minPlayTimeSeconds, minPoPL);
    }

    function createListing(
        address characterContract,
        uint256 tokenId,
        uint96 price,
        uint64 deadline
    ) external returns (uint256 listingId) {
        if (IERC721(characterContract).ownerOf(tokenId) != msg.sender) {
            revert NotCharacterOwner();
        }
        if (licenseManager.isCharacterLocked(characterContract, tokenId)) revert CharacterLocked();
        if (price == 0) revert InvalidPrice();
        if (deadline <= block.timestamp) revert ListingUnavailable();
        _requireEligible(characterContract, tokenId);

        listingId = nextListingId++;
        listings[listingId] = Listing({
            characterContract: characterContract,
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            deadline: deadline,
            open: true
        });
        emit ListingCreated(listingId, characterContract, tokenId, msg.sender, price, deadline);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (!listing.open || listing.seller != msg.sender) revert ListingUnavailable();
        listing.open = false;
        emit ListingCancelled(listingId);
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.open || listing.deadline < block.timestamp) revert ListingUnavailable();
        if (msg.value != listing.price) revert InvalidPayment();
        if (licenseManager.isCharacterLocked(listing.characterContract, listing.tokenId)) {
            revert CharacterLocked();
        }

        IERC721 character = IERC721(listing.characterContract);
        if (character.ownerOf(listing.tokenId) != listing.seller) revert ListingUnavailable();

        listing.open = false;
        character.transferFrom(listing.seller, msg.sender, listing.tokenId);

        (address royaltyReceiver, uint256 royaltyAmount) =
            IERC2981(listing.characterContract).royaltyInfo(listing.tokenId, listing.price);
        uint256 protocolFee = uint256(listing.price) * protocolFeeBps / 10_000;
        if (royaltyAmount + protocolFee > listing.price) revert InvalidFee();

        credits[listing.seller] += uint256(listing.price) - royaltyAmount - protocolFee;
        if (royaltyAmount != 0) credits[royaltyReceiver] += royaltyAmount;
        if (protocolFee != 0) credits[feeRecipient] += protocolFee;

        emit CharacterPurchased(
            listingId,
            msg.sender,
            listing.seller,
            listing.price,
            royaltyReceiver,
            royaltyAmount,
            protocolFee
        );
    }

    /// @notice Enforces the listing eligibility bars. Reads mint time from the character and play
    /// history from the state registry; a contract that is not a genuine, played PoPLY character
    /// (e.g. a spoofed ERC721) has no registry history and therefore fails these checks.
    function _requireEligible(address characterContract, uint256 tokenId) private view {
        uint64 mintedAt = IPoPLYCharacter(characterContract).mintedAtOf(tokenId);
        if (mintedAt == 0 || block.timestamp < uint256(mintedAt) + minListingAgeSeconds) {
            revert NotEligibleForListing();
        }
        IStateRegistry.CharacterState memory state =
            stateRegistry.stateOf(characterContract, tokenId);
        if (state.playTimeSeconds < minListingPlayTimeSeconds || state.popl < minListingPoPL) {
            revert NotEligibleForListing();
        }
    }
}
