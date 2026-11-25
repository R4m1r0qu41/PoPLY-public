// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CharacterKeys, CreditEscrow, Owned } from "./Common.sol";
import {
    IERC721,
    IPoPLYCharacter,
    ICharacterLock,
    IPoPLEligibility,
    IPublisherLicensingPolicy
} from "./interfaces/IPoPLY.sol";

contract Licensing is CreditEscrow, ICharacterLock {
    error NotCharacterOwner();
    error InvalidMode();
    error InvalidTerms();
    error InvalidDuration();
    error InvalidPayment();
    error InvalidLicensee();
    error PublicOfferNotAllowed();
    error OfferUnavailable();
    error CharacterAlreadyLocked();
    error NoExpiredLicense();
    error InsufficientPoPL(uint16 required, uint16 actual);

    enum Mode {
        None,
        NPC,
        Tournament,
        SeasonalBoss,
        StoryCampaign,
        PromotionalAppearance,
        AIAgent
    }

    struct Offer {
        address characterContract;
        uint256 tokenId;
        address licensor;
        address allowedLicensee;
        uint96 price;
        uint64 duration;
        uint64 deadline;
        Mode mode;
        bytes32 termsHash;
        // When true, an accepted license immobilizes the NFT (blocks transfer/sale) for its whole
        // duration — the exclusive "the character is committed to this game" grant. When false the
        // license is a non-exclusive usage right: the NFT stays tradeable and the grant rides along
        // with ownership until it expires.
        bool exclusive;
        bool open;
    }

    struct License {
        uint256 offerId;
        address licensor;
        address licensee;
        uint64 startedAt;
        uint64 endsAt;
        Mode mode;
        bytes32 termsHash;
        bool exclusive;
    }

    uint256 public nextOfferId = 1;
    uint16 public minimumPoPL;
    IPoPLEligibility public immutable stateRegistry;
    IPublisherLicensingPolicy public immutable publisherPolicy;

    mapping(uint256 offerId => Offer offer) public offers;
    mapping(bytes32 characterKey => License license) private _activeLicenses;

    event OfferCreated(
        uint256 indexed offerId,
        address indexed characterContract,
        uint256 indexed tokenId,
        address licensor,
        address allowedLicensee,
        Mode mode,
        uint256 price,
        uint64 duration,
        uint64 deadline,
        bytes32 termsHash,
        bool exclusive
    );
    event OfferCancelled(uint256 indexed offerId);
    event LicenseActivated(
        uint256 indexed offerId,
        address indexed characterContract,
        uint256 indexed tokenId,
        address licensor,
        address licensee,
        Mode mode,
        uint64 startedAt,
        uint64 endsAt,
        bytes32 termsHash,
        bool exclusive
    );
    event LicenseSettled(
        address indexed characterContract, uint256 indexed tokenId, uint256 indexed offerId
    );
    event MinimumPoPLConfigured(uint16 minimumPoPL);

    constructor(
        address initialOwner,
        address initialStateRegistry,
        address initialPublisherPolicy,
        address initialFeeRecipient,
        uint16 initialFeeBps,
        uint16 initialMinimumPoPL
    ) Owned(initialOwner) {
        if (initialStateRegistry == address(0) || initialPublisherPolicy == address(0)) {
            revert ZeroAddress();
        }
        stateRegistry = IPoPLEligibility(initialStateRegistry);
        publisherPolicy = IPublisherLicensingPolicy(initialPublisherPolicy);
        minimumPoPL = initialMinimumPoPL;
        _configureFee(initialFeeRecipient, initialFeeBps);
        emit MinimumPoPLConfigured(initialMinimumPoPL);
    }

    function configureMinimumPoPL(uint16 level) external onlyOwner {
        minimumPoPL = level;
        emit MinimumPoPLConfigured(level);
    }

    function createOffer(
        address characterContract,
        uint256 tokenId,
        address allowedLicensee,
        Mode mode,
        uint96 price,
        uint64 duration,
        uint64 deadline,
        bytes32 termsHash,
        bool exclusive
    ) external returns (uint256 offerId) {
        if (IERC721(characterContract).ownerOf(tokenId) != msg.sender) {
            revert NotCharacterOwner();
        }
        if (mode == Mode.None) revert InvalidMode();
        if (termsHash == bytes32(0)) revert InvalidTerms();
        if (duration == 0) revert InvalidDuration();
        if (deadline <= block.timestamp) revert OfferUnavailable();
        // A public (open) offer can be accepted by anyone, so it is a griefing lock unless the
        // publisher opted into open licensing for this game or the price clears the publisher's
        // collectible threshold. A named (allowedLicensee) offer is exempt: only that party can
        // accept it. See VerifierRegistry.publicOfferAllowed.
        if (allowedLicensee == address(0)) {
            bytes32 gameId = IPoPLYCharacter(characterContract).gameIdOf(tokenId);
            if (!publisherPolicy.publicOfferAllowed(gameId, price)) revert PublicOfferNotAllowed();
        }
        // Only one license may be active at a time regardless of exclusivity (single active slot),
        // so a live grant of either kind blocks a new offer from being accepted onto the same slot.
        if (_hasActiveLicense(characterContract, tokenId)) revert CharacterAlreadyLocked();
        uint16 characterPoPL = stateRegistry.poplOf(characterContract, tokenId);
        if (characterPoPL < minimumPoPL) {
            revert InsufficientPoPL(minimumPoPL, characterPoPL);
        }

        offerId = nextOfferId++;
        offers[offerId] = Offer({
            characterContract: characterContract,
            tokenId: tokenId,
            licensor: msg.sender,
            allowedLicensee: allowedLicensee,
            price: price,
            duration: duration,
            deadline: deadline,
            mode: mode,
            termsHash: termsHash,
            exclusive: exclusive,
            open: true
        });

        emit OfferCreated(
            offerId,
            characterContract,
            tokenId,
            msg.sender,
            allowedLicensee,
            mode,
            price,
            duration,
            deadline,
            termsHash,
            exclusive
        );
    }

    function cancelOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (!offer.open || offer.licensor != msg.sender) revert OfferUnavailable();
        offer.open = false;
        emit OfferCancelled(offerId);
    }

    function acceptOffer(uint256 offerId) external payable nonReentrant {
        Offer storage offer = offers[offerId];
        if (!offer.open || offer.deadline < block.timestamp) revert OfferUnavailable();
        if (offer.allowedLicensee != address(0) && offer.allowedLicensee != msg.sender) {
            revert InvalidLicensee();
        }
        if (msg.value != offer.price) revert InvalidPayment();
        if (IERC721(offer.characterContract).ownerOf(offer.tokenId) != offer.licensor) {
            revert OfferUnavailable();
        }
        if (_hasActiveLicense(offer.characterContract, offer.tokenId)) {
            revert CharacterAlreadyLocked();
        }

        offer.open = false;
        uint64 startedAt = uint64(block.timestamp);
        uint64 endsAt = startedAt + offer.duration;
        _activeLicenses[_key(offer.characterContract, offer.tokenId)] = License({
            offerId: offerId,
            licensor: offer.licensor,
            licensee: msg.sender,
            startedAt: startedAt,
            endsAt: endsAt,
            mode: offer.mode,
            termsHash: offer.termsHash,
            exclusive: offer.exclusive
        });

        uint256 fee = uint256(offer.price) * protocolFeeBps / 10_000;
        credits[offer.licensor] += uint256(offer.price) - fee;
        if (fee != 0) credits[feeRecipient] += fee;

        emit LicenseActivated(
            offerId,
            offer.characterContract,
            offer.tokenId,
            offer.licensor,
            msg.sender,
            offer.mode,
            startedAt,
            endsAt,
            offer.termsHash,
            offer.exclusive
        );
    }

    function settleExpired(address characterContract, uint256 tokenId) external {
        bytes32 characterKey = _key(characterContract, tokenId);
        License memory license = _activeLicenses[characterKey];
        if (license.endsAt == 0 || block.timestamp < license.endsAt) {
            revert NoExpiredLicense();
        }
        delete _activeLicenses[characterKey];
        emit LicenseSettled(characterContract, tokenId, license.offerId);
    }

    function activeLicenseOf(address characterContract, uint256 tokenId)
        external
        view
        returns (License memory)
    {
        return _activeLicenses[_key(characterContract, tokenId)];
    }

    /// @notice The transfer lock consulted by CharacterNFT and the Marketplace. Only an active
    /// *exclusive* license immobilizes the NFT; a non-exclusive usage grant leaves it tradeable.
    function isCharacterLocked(address characterContract, uint256 tokenId)
        public
        view
        returns (bool)
    {
        License storage license = _activeLicenses[_key(characterContract, tokenId)];
        return license.exclusive && license.endsAt != 0 && block.timestamp < license.endsAt;
    }

    /// @notice Whether any license (exclusive or not) is currently active. Used to enforce the
    /// single active-license slot when creating or accepting an offer.
    function _hasActiveLicense(address characterContract, uint256 tokenId)
        private
        view
        returns (bool)
    {
        License storage license = _activeLicenses[_key(characterContract, tokenId)];
        return license.endsAt != 0 && block.timestamp < license.endsAt;
    }

    function _key(address characterContract, uint256 tokenId) private pure returns (bytes32) {
        return CharacterKeys.keyOf(characterContract, tokenId);
    }
}
