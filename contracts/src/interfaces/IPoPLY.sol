// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data)
        external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address approved, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

interface IERC2981 is IERC165 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}

interface ICharacterLock {
    function isCharacterLocked(address characterContract, uint256 tokenId)
        external
        view
        returns (bool);
}

/// @notice Item transfer lock consulted by ItemNFT — the interlock analogue of ICharacterLock.
interface IItemLock {
    function isItemLocked(address itemContract, uint256 itemId) external view returns (bool);
}

/// @notice The registry-facing surface of an item collection (RFC-009 Verified Issuance).
interface IItemNFT is IERC721 {
    function gameIdOf(uint256 tokenId) external view returns (bytes32);
    function itemClassOf(uint256 tokenId) external view returns (bytes32);
    function mintedAtOf(uint256 tokenId) external view returns (uint64);
    function mint(
        address to,
        uint256 tokenId,
        bytes32 gameId,
        bytes32 itemClassId,
        string calldata uri
    ) external;
    function burn(uint256 tokenId) external;
    function transform(uint256 tokenId, bytes32 newItemClassId) external;
}

interface IVerifierRegistry {
    function isVerifier(address signer) external view returns (bool);
    /// @notice True only when `signer` is an active verifier AND the publisher it belongs to owns
    /// `gameId`. This scopes a verifier to the games of its own publisher instead of trusting every
    /// active verifier for every game.
    function isVerifierForGame(address signer, bytes32 gameId) external view returns (bool);
    function publisherIdOf(address signer) external view returns (bytes32);
}

/// @notice Publisher-level licensing policy consulted by the Licensing contract before it lets an
/// arbitrary caller accept a public (open) offer on a character.
interface IPublisherLicensingPolicy {
    function publicOfferAllowed(bytes32 gameId, uint96 price) external view returns (bool);
}

interface IPoPLEligibility {
    function poplOf(address characterContract, uint256 tokenId) external view returns (uint16);
}

interface IRoyaltyRegistry {
    function configureRoyalty(uint256 tokenId, address receiver, uint16 royaltyBps) external;
    function royaltyInfo(address collection, uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}

interface IPoPLYCharacter is IERC721, IERC2981 {
    function licenseManager() external view returns (ICharacterLock);
    function gameIdOf(uint256 tokenId) external view returns (bytes32);
    /// @notice Unix timestamp at which the token was minted. Used by the Marketplace to enforce a
    /// minimum character age before it may be listed.
    function mintedAtOf(uint256 tokenId) external view returns (uint64);
}

interface ICharacterNFT is IPoPLYCharacter, IERC721Metadata {
    function royaltyRegistry() external view returns (IRoyaltyRegistry);
    function metadataCommitmentOf(uint256 tokenId) external view returns (bytes32);
    function mint(
        address to,
        uint256 tokenId,
        bytes32 gameId,
        bytes32 metadataCommitment,
        string calldata uri,
        address royaltyReceiver,
        uint16 royaltyBps
    ) external;
}

interface IStateRegistry is IPoPLEligibility {
    struct Checkpoint {
        address characterContract;
        uint256 tokenId;
        bytes32 gameId;
        uint64 sequence;
        bytes32 stateHash;
        uint64 playTimeSeconds;
        uint16 popl;
        bytes32 policyId;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct Achievement {
        address characterContract;
        uint256 tokenId;
        bytes32 gameId;
        bytes32 achievementId;
        bytes32 evidenceHash;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct CharacterState {
        uint64 sequence;
        uint64 playTimeSeconds;
        uint16 popl;
        uint64 occurredAt;
        bytes32 stateHash;
        bytes32 policyId;
        bytes32 checkpointDigest;
    }

    function submitCheckpoint(Checkpoint calldata checkpoint, bytes calldata signature)
        external
        returns (bytes32 digest);
    function submitAchievement(Achievement calldata achievement, bytes calldata signature)
        external
        returns (bytes32 digest);
    function stateOf(address characterContract, uint256 tokenId)
        external
        view
        returns (CharacterState memory);
    function hasAchievement(address characterContract, uint256 tokenId, bytes32 achievementId)
        external
        view
        returns (bool);
}

interface ILicensing is ICharacterLock {
    enum Mode {
        None,
        NPC,
        Tournament,
        SeasonalBoss,
        StoryCampaign,
        PromotionalAppearance,
        AIAgent
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
    ) external returns (uint256 offerId);
    function cancelOffer(uint256 offerId) external;
    function acceptOffer(uint256 offerId) external payable;
    function settleExpired(address characterContract, uint256 tokenId) external;
    function activeLicenseOf(address characterContract, uint256 tokenId)
        external
        view
        returns (License memory);
    function withdraw() external;
}

interface IMarketplace {
    struct Listing {
        address characterContract;
        uint256 tokenId;
        address seller;
        uint96 price;
        uint64 deadline;
        bool open;
    }

    function createListing(
        address characterContract,
        uint256 tokenId,
        uint96 price,
        uint64 deadline
    ) external returns (uint256 listingId);
    function cancelListing(uint256 listingId) external;
    function buy(uint256 listingId) external payable;
    function listings(uint256 listingId) external view returns (Listing memory);
    function withdraw() external;
}
