// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { SignatureChecker } from "./Common.sol";
import { IItemNFT, IVerifierRegistry } from "./interfaces/IPoPLY.sol";

/// @notice Verified-Issuance registry (RFC-009). Items are the second proof concept on the PoPLY
/// substrate: where characters accumulate sequence-ordered Proof-of-Play checkpoints, an item's
/// integrity is a supply invariant — "exactly one of this instance exists" — so the registry
/// accepts attestations only at the three supply-changing events (issuance, destruction,
/// transformation), each signed by a verifier scoped to the item's game. ERC-721 uniqueness plus
/// single-issuance is the anti-duplication guarantee; a token can never be re-issued after
/// destruction.
contract ItemRegistry {
    error ZeroAddress();
    error InvalidCommitment();
    error PayloadExpired();
    error OccurredInFuture();
    error WrongGame();
    error UnauthorizedVerifier();
    error ItemAlreadyDestroyed();
    error TransformationConflict();

    string public constant NAME = "PoPLY Item Registry";
    string public constant VERSION = "2";

    bytes32 public constant ISSUANCE_TYPEHASH = keccak256(
        "ItemIssuance(address itemContract,uint256 tokenId,bytes32 gameId,bytes32 itemClassId,bytes32 originHash,bytes32 metadataHash,address owner,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 public constant DESTRUCTION_TYPEHASH = keccak256(
        "ItemDestruction(address itemContract,uint256 tokenId,bytes32 gameId,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 public constant TRANSFORMATION_TYPEHASH = keccak256(
        "ItemTransformation(address itemContract,uint256 tokenId,bytes32 gameId,uint64 sequence,bytes32 previousItemClassId,bytes32 newItemClassId,bytes32 transformHash,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    struct ItemIssuance {
        address itemContract;
        uint256 tokenId;
        bytes32 gameId;
        bytes32 itemClassId;
        bytes32 originHash;
        bytes32 metadataHash;
        address owner;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct ItemDestruction {
        address itemContract;
        uint256 tokenId;
        bytes32 gameId;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct ItemTransformation {
        address itemContract;
        uint256 tokenId;
        bytes32 gameId;
        uint64 sequence;
        bytes32 previousItemClassId;
        bytes32 newItemClassId;
        bytes32 transformHash;
        uint64 occurredAt;
        uint64 deadline;
    }

    IVerifierRegistry public immutable verifierRegistry;
    bytes32 private immutable _hashedName;
    bytes32 private immutable _hashedVersion;

    /// @notice Terminal destruction marker. Kept here rather than inferred from token absence so a
    /// destroyed token id can never be re-issued — issuance checks it before minting.
    mapping(address itemContract => mapping(uint256 tokenId => bool destroyed)) public destroyed;

    mapping(address => mapping(uint256 => uint64)) public transformationSequence;

    event ItemIssued(
        address indexed itemContract,
        uint256 indexed tokenId,
        bytes32 indexed gameId,
        bytes32 itemClassId,
        bytes32 originHash,
        address owner,
        address verifier,
        bytes32 digest
    );
    event ItemDestructionRecorded(
        address indexed itemContract, uint256 indexed tokenId, address verifier, bytes32 digest
    );
    event ItemTransformationRecorded(
        address indexed itemContract,
        uint256 indexed tokenId,
        bytes32 newItemClassId,
        bytes32 transformHash,
        address verifier,
        bytes32 digest
    );

    constructor(address registry) {
        if (registry == address(0)) revert ZeroAddress();
        verifierRegistry = IVerifierRegistry(registry);
        _hashedName = keccak256(bytes(NAME));
        _hashedVersion = keccak256(bytes(VERSION));
    }

    /// @notice Mints the item on an accepted issuance attestation. Non-repeatability needs no
    /// separate bookkeeping while the token lives (mint reverts on an existing token) and is
    /// enforced by the destroyed marker afterward.
    function submitIssuance(
        ItemIssuance calldata issuance,
        bytes calldata signature,
        string calldata uri
    ) external returns (bytes32 digest) {
        if (issuance.itemContract == address(0) || issuance.owner == address(0)) {
            revert ZeroAddress();
        }
        if (issuance.itemClassId == bytes32(0) || issuance.originHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (issuance.metadataHash != keccak256(bytes(uri))) revert InvalidCommitment();
        _validateWindow(issuance.occurredAt, issuance.deadline);
        if (destroyed[issuance.itemContract][issuance.tokenId]) revert ItemAlreadyDestroyed();

        digest = issuanceDigest(issuance);
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, issuance.gameId)) {
            revert UnauthorizedVerifier();
        }

        IItemNFT(issuance.itemContract)
            .mint(issuance.owner, issuance.tokenId, issuance.gameId, issuance.itemClassId, uri);

        emit ItemIssued(
            issuance.itemContract,
            issuance.tokenId,
            issuance.gameId,
            issuance.itemClassId,
            issuance.originHash,
            issuance.owner,
            verifier,
            digest
        );
    }

    function submitDestruction(ItemDestruction calldata destruction, bytes calldata signature)
        external
        returns (bytes32 digest)
    {
        _validateItem(destruction.itemContract, destruction.tokenId, destruction.gameId);
        _validateWindow(destruction.occurredAt, destruction.deadline);

        digest = destructionDigest(destruction);
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, destruction.gameId)) {
            revert UnauthorizedVerifier();
        }

        destroyed[destruction.itemContract][destruction.tokenId] = true;
        IItemNFT(destruction.itemContract).burn(destruction.tokenId);

        emit ItemDestructionRecorded(
            destruction.itemContract, destruction.tokenId, verifier, digest
        );
    }

    function submitTransformation(
        ItemTransformation calldata transformation,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        _validateItem(transformation.itemContract, transformation.tokenId, transformation.gameId);
        if (
            transformation.newItemClassId == bytes32(0)
                || transformation.transformHash == bytes32(0)
        ) {
            revert InvalidCommitment();
        }
        _validateWindow(transformation.occurredAt, transformation.deadline);

        if (
            transformation.sequence
                    != transformationSequence[transformation.itemContract][transformation.tokenId]
                        + 1
                || transformation.previousItemClassId
                    != IItemNFT(transformation.itemContract).itemClassOf(transformation.tokenId)
        ) revert TransformationConflict();

        digest = transformationDigest(transformation);
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, transformation.gameId)) {
            revert UnauthorizedVerifier();
        }

        transformationSequence[transformation.itemContract][transformation.tokenId] =
        transformation.sequence;
        IItemNFT(transformation.itemContract)
            .transform(transformation.tokenId, transformation.newItemClassId);

        emit ItemTransformationRecorded(
            transformation.itemContract,
            transformation.tokenId,
            transformation.newItemClassId,
            transformation.transformHash,
            verifier,
            digest
        );
    }

    function issuanceDigest(ItemIssuance calldata issuance) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ISSUANCE_TYPEHASH,
                issuance.itemContract,
                issuance.tokenId,
                issuance.gameId,
                issuance.itemClassId,
                issuance.originHash,
                issuance.metadataHash,
                issuance.owner,
                issuance.occurredAt,
                issuance.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function destructionDigest(ItemDestruction calldata destruction) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                DESTRUCTION_TYPEHASH,
                destruction.itemContract,
                destruction.tokenId,
                destruction.gameId,
                destruction.occurredAt,
                destruction.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function transformationDigest(ItemTransformation calldata transformation)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFORMATION_TYPEHASH,
                transformation.itemContract,
                transformation.tokenId,
                transformation.gameId,
                transformation.sequence,
                transformation.previousItemClassId,
                transformation.newItemClassId,
                transformation.transformHash,
                transformation.occurredAt,
                transformation.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(_DOMAIN_TYPEHASH, _hashedName, _hashedVersion, block.chainid, address(this))
        );
    }

    function _validateWindow(uint64 occurredAt, uint64 deadline) private view {
        if (block.timestamp > deadline) revert PayloadExpired();
        if (occurredAt > block.timestamp + 5 minutes) revert OccurredInFuture();
    }

    function _validateItem(address itemContract, uint256 tokenId, bytes32 gameId) private view {
        if (itemContract == address(0)) revert ZeroAddress();
        IItemNFT item = IItemNFT(itemContract);
        // ownerOf also proves that the item exists.
        item.ownerOf(tokenId);
        if (item.gameIdOf(tokenId) != gameId) revert WrongGame();
    }
}
