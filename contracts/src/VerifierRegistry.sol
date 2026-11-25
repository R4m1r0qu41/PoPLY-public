// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { Owned } from "./Common.sol";
import { IVerifierRegistry, IPublisherLicensingPolicy } from "./interfaces/IPoPLY.sol";

/// @notice Central registry of publishers, the games they own, their verifier signers, and their
/// licensing policy. A verifier is scoped to the games of its own publisher (see
/// {isVerifierForGame}) rather than being trusted globally, and each publisher configures whether
/// its characters may be openly licensed (see {publicOfferAllowed}).
contract VerifierRegistry is Owned, IVerifierRegistry, IPublisherLicensingPolicy {
    error InvalidPublisherId();
    error InvalidGameId();
    error PublisherNotRegistered();
    error GameAlreadyOwned();

    struct Verifier {
        bytes32 publisherId;
        uint64 revision;
        bool active;
    }

    struct Publisher {
        bool registered;
        // #7: when true, anyone may accept a public (open) offer on this publisher's characters.
        bool openLicensing;
        // #7: a public offer priced at or above this (and non-zero) may be accepted by anyone even
        // when openLicensing is false — the "valuable enough to be a collectible" path.
        uint96 minPublicOfferPrice;
    }

    mapping(address signer => Verifier verifier) public verifiers;
    mapping(bytes32 publisherId => Publisher publisher) public publishers;
    mapping(bytes32 gameId => bytes32 publisherId) public gameOwner;

    event PublisherRegistered(
        bytes32 indexed publisherId, bool openLicensing, uint96 minPublicOfferPrice
    );
    event GameAssigned(bytes32 indexed gameId, bytes32 indexed publisherId);
    event VerifierConfigured(
        address indexed signer, bytes32 indexed publisherId, bool active, uint64 revision
    );

    constructor(address initialOwner) Owned(initialOwner) { }

    /// @notice Register a publisher or update its licensing policy. Idempotent for a given id.
    function registerPublisher(bytes32 publisherId, bool openLicensing, uint96 minPublicOfferPrice)
        external
        onlyOwner
    {
        if (publisherId == bytes32(0)) revert InvalidPublisherId();
        publishers[publisherId] = Publisher({
            registered: true, openLicensing: openLicensing, minPublicOfferPrice: minPublicOfferPrice
        });
        emit PublisherRegistered(publisherId, openLicensing, minPublicOfferPrice);
    }

    /// @notice Assign a game to a publisher. A game may only be owned by one publisher; reassigning
    /// to a different publisher is rejected so ownership cannot be silently hijacked.
    function assignGame(bytes32 gameId, bytes32 publisherId) external onlyOwner {
        if (gameId == bytes32(0)) revert InvalidGameId();
        if (!publishers[publisherId].registered) revert PublisherNotRegistered();
        bytes32 currentOwner = gameOwner[gameId];
        if (currentOwner != bytes32(0) && currentOwner != publisherId) revert GameAlreadyOwned();
        gameOwner[gameId] = publisherId;
        emit GameAssigned(gameId, publisherId);
    }

    function configureVerifier(address signer, bytes32 publisherId, bool active)
        external
        onlyOwner
    {
        if (signer == address(0)) revert ZeroAddress();
        if (publisherId == bytes32(0)) revert InvalidPublisherId();
        if (!publishers[publisherId].registered) revert PublisherNotRegistered();

        Verifier storage verifier = verifiers[signer];
        unchecked {
            verifier.revision += 1;
        }
        verifier.publisherId = publisherId;
        verifier.active = active;

        emit VerifierConfigured(signer, publisherId, active, verifier.revision);
    }

    function isVerifier(address signer) external view returns (bool) {
        return verifiers[signer].active;
    }

    function isVerifierForGame(address signer, bytes32 gameId) external view returns (bool) {
        Verifier storage verifier = verifiers[signer];
        if (!verifier.active || verifier.publisherId == bytes32(0)) return false;
        return gameOwner[gameId] == verifier.publisherId;
    }

    function publisherIdOf(address signer) external view returns (bytes32) {
        return verifiers[signer].publisherId;
    }

    function publisherOfGame(bytes32 gameId) external view returns (bytes32) {
        return gameOwner[gameId];
    }

    /// @inheritdoc IPublisherLicensingPolicy
    function publicOfferAllowed(bytes32 gameId, uint96 price) external view returns (bool) {
        Publisher storage publisher = publishers[gameOwner[gameId]];
        if (!publisher.registered) return false;
        bool priceQualifies =
            publisher.minPublicOfferPrice != 0 && price >= publisher.minPublicOfferPrice;
        return publisher.openLicensing || priceQualifies;
    }
}
