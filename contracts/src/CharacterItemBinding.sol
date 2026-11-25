// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CharacterKeys, SignatureChecker } from "./Common.sol";
import { IItemLock, IItemNFT, IPoPLYCharacter, IVerifierRegistry } from "./interfaces/IPoPLY.sol";

/// @notice Optional character–item interlock (RFC-009 extension). Binds an item NFT to a
/// character NFT so the pair reads as one provenance unit: while bound, the item cannot transfer
/// separately (ItemNFT consults isItemLocked), and an active exclusive license on the character
/// extends to its bound items automatically — a licensed champion cannot be quietly stripped of
/// the sword it is famous for. The layer is deliberately additive: neither the StateRegistry nor
/// the ItemRegistry knows it exists, and deployments that don't want the interlock simply point
/// ItemNFT at a null lock.
contract CharacterItemBinding is IItemLock {
    error ZeroAddress();
    error NotOwnerOfBoth();
    error WrongGame();
    error AlreadyBound();
    error NotBound();
    error NotReleasable();
    error CharacterExclusivelyLicensed();
    error CharacterOwnerChanged();
    error PayloadExpired();
    error OccurredInFuture();
    error UnauthorizedVerifier();
    error BindingAttestationReused();

    string public constant NAME = "PoPLY Character Item Binding";
    string public constant VERSION = "1";

    bytes32 public constant BINDING_TYPEHASH = keccak256(
        "Binding(address characterContract,uint256 characterId,address itemContract,uint256 itemId,bool releasable,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    struct BindingRequest {
        address characterContract;
        uint256 characterId;
        address itemContract;
        uint256 itemId;
        // When false the binding is soulbound: only the publisher's verifier can authorize an
        // unbind (via a fresh binding attestation is out of scope for v0.1 — a non-releasable
        // binding is permanent for the item's lifetime).
        bool releasable;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct Binding {
        address characterContract;
        uint256 characterId;
        // Owner of the pair at bind time. If the character has since moved, the item unbinds
        // rather than following an owner it no longer shares.
        address boundOwner;
        bool releasable;
        uint64 boundAt;
    }

    IVerifierRegistry public immutable verifierRegistry;
    bytes32 private immutable _hashedName;
    bytes32 private immutable _hashedVersion;

    mapping(bytes32 itemKey => Binding binding) private _bindings;
    /// @notice One-time consumption marker for binding attestations. Without it, the same signed
    /// attestation could be replayed by the owner within its deadline window after an unbind —
    /// the only signature in the system that would otherwise lack strict consumption. Binding is
    /// a game-approved action, so re-binding must require a fresh verifier signature.
    mapping(bytes32 digest => bool used) public usedBindingDigests;

    event ItemBound(
        address indexed itemContract,
        uint256 indexed itemId,
        address indexed characterContract,
        uint256 characterId,
        address boundOwner,
        bool releasable,
        address verifier,
        bytes32 digest
    );
    event ItemUnbound(
        address indexed itemContract,
        uint256 indexed itemId,
        address indexed characterContract,
        uint256 characterId
    );

    constructor(address registry) {
        if (registry == address(0)) revert ZeroAddress();
        verifierRegistry = IVerifierRegistry(registry);
        _hashedName = keccak256(bytes(NAME));
        _hashedVersion = keccak256(bytes(VERSION));
    }

    /// @notice Binds an item to a character. Binding is a game action, so it requires a
    /// verifier-signed attestation (the game decides whether this equipment pairing is legal) on
    /// top of the ownership requirement that the caller owns both tokens in the same game.
    function bind(BindingRequest calldata request, bytes calldata signature)
        external
        returns (bytes32 digest)
    {
        if (block.timestamp > request.deadline) revert PayloadExpired();
        if (request.occurredAt > block.timestamp + 5 minutes) revert OccurredInFuture();

        IItemNFT item = IItemNFT(request.itemContract);
        IPoPLYCharacter character = IPoPLYCharacter(request.characterContract);
        if (item.ownerOf(request.itemId) != msg.sender) revert NotOwnerOfBoth();
        if (character.ownerOf(request.characterId) != msg.sender) revert NotOwnerOfBoth();

        bytes32 gameId = item.gameIdOf(request.itemId);
        if (character.gameIdOf(request.characterId) != gameId) revert WrongGame();

        bytes32 itemKey = CharacterKeys.keyOf(request.itemContract, request.itemId);
        if (_bindings[itemKey].boundAt != 0) revert AlreadyBound();

        digest = bindingDigest(request);
        if (usedBindingDigests[digest]) revert BindingAttestationReused();
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, gameId)) revert UnauthorizedVerifier();

        usedBindingDigests[digest] = true;
        _bindings[itemKey] = Binding({
            characterContract: request.characterContract,
            characterId: request.characterId,
            boundOwner: msg.sender,
            releasable: request.releasable,
            boundAt: uint64(block.timestamp)
        });

        emit ItemBound(
            request.itemContract,
            request.itemId,
            request.characterContract,
            request.characterId,
            msg.sender,
            request.releasable,
            verifier,
            digest
        );
    }

    /// @notice Releases a releasable binding. Callable by the current owner of the pair; needs no
    /// verifier signature. An active exclusive character license protects the live equipment set.
    function unbind(address itemContract, uint256 itemId) external {
        bytes32 itemKey = CharacterKeys.keyOf(itemContract, itemId);
        Binding memory binding = _bindings[itemKey];
        if (binding.boundAt == 0) revert NotBound();
        if (!binding.releasable) revert NotReleasable();
        if (IItemNFT(itemContract).ownerOf(itemId) != msg.sender) revert NotOwnerOfBoth();
        if (IPoPLYCharacter(binding.characterContract)
                .licenseManager()
                .isCharacterLocked(binding.characterContract, binding.characterId)) revert CharacterExclusivelyLicensed();
        delete _bindings[itemKey];
        emit ItemUnbound(itemContract, itemId, binding.characterContract, binding.characterId);
    }

    /// @notice Clears a binding whose character has left the bound owner (sold, transferred).
    /// Anyone may call: the binding's premise — one owner holds the pair — no longer holds, and a
    /// stale binding would otherwise lock the item forever to a character its owner lost. This is
    /// the v0.1 answer to the "does a bound pair transfer atomically" question in RFC-009: it
    /// does not; the character sale severs the binding. Severance is deliberately lazy — no
    /// transfer hook exists on the character contract, so a sale on any venue (including external
    /// marketplaces) becomes severable here without coupling PoPLY to marketplace
    /// implementations; the item stays locked until this settlement runs.
    function settleOrphanedBinding(address itemContract, uint256 itemId) external {
        bytes32 itemKey = CharacterKeys.keyOf(itemContract, itemId);
        Binding memory binding = _bindings[itemKey];
        if (binding.boundAt == 0) revert NotBound();
        address characterOwner =
            IPoPLYCharacter(binding.characterContract).ownerOf(binding.characterId);
        if (characterOwner == binding.boundOwner) revert CharacterOwnerChanged();
        delete _bindings[itemKey];
        emit ItemUnbound(itemContract, itemId, binding.characterContract, binding.characterId);
    }

    function bindingOf(address itemContract, uint256 itemId)
        external
        view
        returns (Binding memory)
    {
        return _bindings[CharacterKeys.keyOf(itemContract, itemId)];
    }

    /// @notice The item transfer lock consulted by ItemNFT. A bound item never transfers
    /// separately — the bind itself is the lock; the exclusive-license inheritance is implicit
    /// because the character cannot transfer under an exclusive lock and the item cannot
    /// transfer while bound to it.
    function isItemLocked(address itemContract, uint256 itemId) external view returns (bool) {
        return _bindings[CharacterKeys.keyOf(itemContract, itemId)].boundAt != 0;
    }

    function bindingDigest(BindingRequest calldata request) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                BINDING_TYPEHASH,
                request.characterContract,
                request.characterId,
                request.itemContract,
                request.itemId,
                request.releasable,
                request.occurredAt,
                request.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(_DOMAIN_TYPEHASH, _hashedName, _hashedVersion, block.chainid, address(this))
        );
    }
}
