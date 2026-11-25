// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CharacterItemBinding } from "../src/CharacterItemBinding.sol";
import { CharacterNFT } from "../src/CharacterNFT.sol";
import { ItemNFT, NullItemLock } from "../src/ItemNFT.sol";
import { ItemRegistry } from "../src/ItemRegistry.sol";
import { Licensing } from "../src/Licensing.sol";
import { RoyaltyRegistry } from "../src/RoyaltyRegistry.sol";
import { StateRegistry } from "../src/StateRegistry.sol";
import { VerifierRegistry } from "../src/VerifierRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
    function mockCallRevert(address callee, bytes calldata data, bytes calldata revertData) external;
    function clearMockedCalls() external;
}

contract ItemsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant VERIFIER_KEY = 0xA11CE;
    uint256 private constant UNTRUSTED_KEY = 0xBAD;

    address private admin = address(0xA0);
    address private player = address(0xB0);
    address private buyer = address(0xC0);
    address private feeRecipient = address(0xF0);
    address private creator = address(0xE0);
    address private verifier;

    bytes32 private gameId = keccak256("poply.reference-arena.v1");
    bytes32 private otherGameId = keccak256("poply.other-game.v1");
    bytes32 private publisherId = keccak256("cipherlayer.reference-publisher");
    bytes32 private swordClass = keccak256("item.sword-of-ages.v1");
    bytes32 private reforgedClass = keccak256("item.sword-of-ages.v2");

    VerifierRegistry private verifiers;
    StateRegistry private stateRegistry;
    ItemRegistry private itemRegistry;
    ItemNFT private items;
    CharacterItemBinding private binding;
    CharacterNFT private characters;
    Licensing private licensing;
    RoyaltyRegistry private royalties;

    function setUp() public {
        vm.warp(1_700_000_000);
        verifier = vm.addr(VERIFIER_KEY);

        verifiers = new VerifierRegistry(admin);
        vm.prank(admin);
        verifiers.registerPublisher(publisherId, false, 0);
        vm.prank(admin);
        verifiers.assignGame(gameId, publisherId);
        vm.prank(admin);
        verifiers.configureVerifier(verifier, publisherId, true);

        stateRegistry = new StateRegistry(address(verifiers));
        royalties = new RoyaltyRegistry();
        licensing = new Licensing(
            admin, address(stateRegistry), address(verifiers), feeRecipient, 250, 0
        );
        characters = new CharacterNFT(
            "PoPLY Arena Characters", "PAC", admin, address(royalties), address(licensing)
        );

        itemRegistry = new ItemRegistry(address(verifiers));
        binding = new CharacterItemBinding(address(verifiers));
        items = new ItemNFT(
            "PoPLY Arena Items", "PAI", admin, address(itemRegistry), address(binding)
        );

        vm.prank(admin);
        characters.mint(
            player,
            1,
            gameId,
            keccak256("character-metadata-v1"),
            "ipfs://poply-reference/1",
            creator,
            500
        );
    }

    function testIssuanceMintsExactlyOnce() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        issuance.metadataHash = keccak256("ipfs://poply-items/1");
        bytes memory signature = _signIssuance(issuance, VERIFIER_KEY);
        itemRegistry.submitIssuance(issuance, signature, "ipfs://poply-items/1");

        _assertEq(uint256(uint160(items.ownerOf(1))), uint256(uint160(player)), "owner");
        _assertEq(items.itemClassOf(1), swordClass, "class");
        _assertEq(items.gameIdOf(1), gameId, "game");

        // Re-issuing the same token id is the dupe vector; the mint's existence check stops it.
        bytes memory replay = _signIssuance(issuance, VERIFIER_KEY);
        vm.expectRevert(ItemNFT.TokenAlreadyExists.selector);
        itemRegistry.submitIssuance(issuance, replay, "ipfs://poply-items/1");
    }

    function testIssuanceRequiresGameScopedVerifier() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        bytes memory forged = _signIssuance(issuance, UNTRUSTED_KEY);
        vm.expectRevert(ItemRegistry.UnauthorizedVerifier.selector);
        itemRegistry.submitIssuance(issuance, forged, "");

        // A real verifier signing for a game its publisher does not own is equally rejected.
        issuance.gameId = otherGameId;
        bytes memory wrongGame = _signIssuance(issuance, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.UnauthorizedVerifier.selector);
        itemRegistry.submitIssuance(issuance, wrongGame, "");
    }

    function testDestructionIsTerminal() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        ItemRegistry.ItemDestruction memory destruction = _destruction(1);
        itemRegistry.submitDestruction(destruction, _signDestruction(destruction, VERIFIER_KEY));
        _assertTrue(itemRegistry.destroyed(address(items), 1), "destroyed marker");

        // The burned token can never come back, even with a fresh verifier signature.
        bytes memory reissue = _signIssuance(issuance, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.ItemAlreadyDestroyed.selector);
        itemRegistry.submitIssuance(issuance, reissue, "");
    }

    function testTransformationUpdatesClassAndKeepsLineage() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        ItemRegistry.ItemTransformation memory transformation = ItemRegistry.ItemTransformation({
            itemContract: address(items),
            tokenId: 1,
            gameId: gameId,
            sequence: 1,
            previousItemClassId: swordClass,
            newItemClassId: reforgedClass,
            transformHash: keccak256("reforge-evidence"),
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 900)
        });
        itemRegistry.submitTransformation(
            transformation, _signTransformation(transformation, VERIFIER_KEY)
        );
        _assertEq(items.itemClassOf(1), reforgedClass, "class after transform");
    }

    function testOnlyRegistryMutatesSupply() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        vm.prank(admin);
        vm.expectRevert(ItemNFT.NotAuthorized.selector);
        items.mint(player, 2, gameId, swordClass, "");

        vm.prank(player);
        vm.expectRevert(ItemNFT.NotAuthorized.selector);
        items.burn(1);

        vm.prank(admin);
        vm.expectRevert(ItemNFT.NotAuthorized.selector);
        items.transform(1, reforgedClass);
    }

    function testBindingLocksItemUntilUnbound() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        CharacterItemBinding.BindingRequest memory request = _bindingRequest(true);
        bytes memory bindSignature = _signBinding(request, VERIFIER_KEY);
        vm.prank(player);
        binding.bind(request, bindSignature);
        _assertTrue(binding.isItemLocked(address(items), 1), "bound item locked");

        // A bound item cannot transfer separately from its character...
        vm.prank(player);
        vm.expectRevert(ItemNFT.ItemLocked.selector);
        items.transferFrom(player, buyer, 1);

        // ...and cannot be destroyed out from under the binding.
        ItemRegistry.ItemDestruction memory destruction = _destruction(1);
        bytes memory destructionSignature = _signDestruction(destruction, VERIFIER_KEY);
        vm.expectRevert(ItemNFT.ItemLocked.selector);
        itemRegistry.submitDestruction(destruction, destructionSignature);

        // Releasable binding: the owner unbinds, and the item moves freely again.
        vm.prank(player);
        binding.unbind(address(items), 1);
        vm.prank(player);
        items.transferFrom(player, buyer, 1);
        _assertEq(uint256(uint160(items.ownerOf(1))), uint256(uint160(buyer)), "post-unbind owner");
    }

    function testBindingAttestationCannotBeReplayedAfterUnbind() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        CharacterItemBinding.BindingRequest memory request = _bindingRequest(true);
        bytes memory bindSignature = _signBinding(request, VERIFIER_KEY);
        vm.prank(player);
        binding.bind(request, bindSignature);
        vm.prank(player);
        binding.unbind(address(items), 1);

        // Re-binding within the attestation's deadline window must require a fresh verifier
        // signature — the consumed digest is dead even though the deadline has not passed.
        vm.prank(player);
        vm.expectRevert(CharacterItemBinding.BindingAttestationReused.selector);
        binding.bind(request, bindSignature);
    }

    function testSoulboundBindingCannotBeReleasedByOwner() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        CharacterItemBinding.BindingRequest memory request = _bindingRequest(false);
        bytes memory bindSignature = _signBinding(request, VERIFIER_KEY);
        vm.prank(player);
        binding.bind(request, bindSignature);

        vm.prank(player);
        vm.expectRevert(CharacterItemBinding.NotReleasable.selector);
        binding.unbind(address(items), 1);
    }

    function testBindingRequiresOwnershipOfBothAndVerifier() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        CharacterItemBinding.BindingRequest memory request = _bindingRequest(true);
        bytes memory signature = _signBinding(request, VERIFIER_KEY);
        vm.prank(buyer);
        vm.expectRevert(CharacterItemBinding.NotOwnerOfBoth.selector);
        binding.bind(request, signature);

        bytes memory forged = _signBinding(request, UNTRUSTED_KEY);
        vm.prank(player);
        vm.expectRevert(CharacterItemBinding.UnauthorizedVerifier.selector);
        binding.bind(request, forged);
    }

    function testCharacterSaleSeversBinding() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");

        CharacterItemBinding.BindingRequest memory request = _bindingRequest(true);
        bytes memory bindSignature = _signBinding(request, VERIFIER_KEY);
        vm.prank(player);
        binding.bind(request, bindSignature);

        // While the pair shares an owner, the orphan settlement path must not fire.
        vm.expectRevert(CharacterItemBinding.CharacterOwnerChanged.selector);
        binding.settleOrphanedBinding(address(items), 1);

        // The character leaves the bound owner; anyone may then sever the stale binding so the
        // item is not locked forever to a character its owner lost.
        vm.prank(player);
        characters.transferFrom(player, buyer, 1);
        binding.settleOrphanedBinding(address(items), 1);
        _assertTrue(!binding.isItemLocked(address(items), 1), "binding severed");
    }

    function testNullItemLockNeverLocks() public {
        NullItemLock nullLock = new NullItemLock();
        _assertTrue(!nullLock.isItemLocked(address(items), 1), "null lock");
    }

    function testIssuanceRejectsRelayerMetadataSubstitution() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        bytes memory signature = _signIssuance(issuance, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.InvalidCommitment.selector);
        itemRegistry.submitIssuance(issuance, signature, "https://attacker.invalid/metadata");
        itemRegistry.submitIssuance(issuance, signature, "");
    }

    function testTransformationOrderingReplayAndPriorClass() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");
        ItemRegistry.ItemTransformation memory first = _transformation(1, swordClass, reforgedClass);
        ItemRegistry.ItemTransformation memory second =
            _transformation(2, reforgedClass, swordClass);
        bytes memory sig1 = _signTransformation(first, VERIFIER_KEY);
        bytes memory sig2 = _signTransformation(second, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.TransformationConflict.selector);
        itemRegistry.submitTransformation(second, sig2);
        itemRegistry.submitTransformation(first, sig1);
        itemRegistry.submitTransformation(second, sig2);
        // Even returning to the old class cannot make an old attestation usable again.
        vm.expectRevert(ItemRegistry.TransformationConflict.selector);
        itemRegistry.submitTransformation(first, sig1);
        first.sequence = 3;
        first.previousItemClassId = reforgedClass;
        bytes memory wrongPrior = _signTransformation(first, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.TransformationConflict.selector);
        itemRegistry.submitTransformation(first, wrongPrior);
        _assertEq(itemRegistry.transformationSequence(address(items), 1), 2, "sequence unchanged");
    }

    function testTransformationIsItemScopedAcrossTransferButNotDestruction() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");
        ItemRegistry.ItemTransformation memory change =
            _transformation(1, swordClass, reforgedClass);
        bytes memory signature = _signTransformation(change, VERIFIER_KEY);
        vm.prank(player);
        items.transferFrom(player, buyer, 1);
        itemRegistry.submitTransformation(change, signature);
        ItemRegistry.ItemDestruction memory destruction = _destruction(1);
        itemRegistry.submitDestruction(destruction, _signDestruction(destruction, VERIFIER_KEY));
        vm.expectRevert(ItemNFT.TokenDoesNotExist.selector);
        itemRegistry.submitTransformation(change, signature);
    }

    function testTransformationWrongGameAndFailedCallDoNotConsumeSequence() public {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");
        ItemRegistry.ItemTransformation memory change =
            _transformation(1, swordClass, reforgedClass);
        change.gameId = otherGameId;
        bytes memory signature = _signTransformation(change, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.WrongGame.selector);
        itemRegistry.submitTransformation(change, signature);
        change.gameId = gameId;
        signature = _signTransformation(change, VERIFIER_KEY);
        vm.mockCallRevert(
            address(items),
            abi.encodeWithSelector(ItemNFT.transform.selector, 1, reforgedClass),
            abi.encodeWithSignature("ForcedFailure()")
        );
        vm.expectRevert(bytes4(keccak256("ForcedFailure()")));
        itemRegistry.submitTransformation(change, signature);
        _assertEq(itemRegistry.transformationSequence(address(items), 1), 0, "rollback");
        vm.clearMockedCalls();
        itemRegistry.submitTransformation(change, signature);
    }

    function testFuzzTransformationSequenceCannotSkip(uint64 supplied) public {
        if (supplied == 1) return;
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");
        ItemRegistry.ItemTransformation memory change =
            _transformation(supplied, swordClass, reforgedClass);
        bytes memory signature = _signTransformation(change, VERIFIER_KEY);
        vm.expectRevert(ItemRegistry.TransformationConflict.selector);
        itemRegistry.submitTransformation(change, signature);
    }

    function testExclusiveLicenseProtectsEquipmentUntilExpiry() public {
        _bindAndLicense(true);
        vm.prank(player);
        vm.expectRevert(CharacterItemBinding.CharacterExclusivelyLicensed.selector);
        binding.unbind(address(items), 1);
        vm.warp(block.timestamp + 3600);
        vm.prank(player);
        binding.unbind(address(items), 1);
    }

    function testNonExclusiveLicenseAllowsEquipmentRelease() public {
        _bindAndLicense(false);
        vm.prank(player);
        binding.unbind(address(items), 1);
        vm.prank(player);
        items.transferFrom(player, buyer, 1);
    }

    function _bindAndLicense(bool exclusive) private {
        ItemRegistry.ItemIssuance memory issuance = _issuance(1);
        itemRegistry.submitIssuance(issuance, _signIssuance(issuance, VERIFIER_KEY), "");
        CharacterItemBinding.BindingRequest memory request = _bindingRequest(true);
        bytes memory signature = _signBinding(request, VERIFIER_KEY);
        vm.prank(player);
        binding.bind(request, signature);
        vm.prank(player);
        uint256 offer = licensing.createOffer(
            address(characters),
            1,
            buyer,
            Licensing.Mode.NPC,
            0,
            3600,
            uint64(block.timestamp + 900),
            keccak256("terms"),
            exclusive
        );
        vm.prank(buyer);
        licensing.acceptOffer(offer);
    }

    function _transformation(uint64 sequence, bytes32 previous, bytes32 next)
        private
        view
        returns (ItemRegistry.ItemTransformation memory)
    {
        return ItemRegistry.ItemTransformation({
            itemContract: address(items),
            tokenId: 1,
            gameId: gameId,
            sequence: sequence,
            previousItemClassId: previous,
            newItemClassId: next,
            transformHash: keccak256("transform"),
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 900)
        });
    }

    function _issuance(uint256 tokenId) private view returns (ItemRegistry.ItemIssuance memory) {
        return ItemRegistry.ItemIssuance({
            itemContract: address(items),
            tokenId: tokenId,
            gameId: gameId,
            itemClassId: swordClass,
            originHash: keccak256("drop:world-boss:2026-07-16"),
            metadataHash: keccak256(""),
            owner: player,
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 900)
        });
    }

    function _destruction(uint256 tokenId)
        private
        view
        returns (ItemRegistry.ItemDestruction memory)
    {
        return ItemRegistry.ItemDestruction({
            itemContract: address(items),
            tokenId: tokenId,
            gameId: gameId,
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 900)
        });
    }

    function _bindingRequest(bool releasable)
        private
        view
        returns (CharacterItemBinding.BindingRequest memory)
    {
        return CharacterItemBinding.BindingRequest({
            characterContract: address(characters),
            characterId: 1,
            itemContract: address(items),
            itemId: 1,
            releasable: releasable,
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 900)
        });
    }

    function _signIssuance(ItemRegistry.ItemIssuance memory issuance, uint256 key)
        private
        returns (bytes memory)
    {
        return _pack(key, itemRegistry.issuanceDigest(issuance));
    }

    function _signDestruction(ItemRegistry.ItemDestruction memory destruction, uint256 key)
        private
        returns (bytes memory)
    {
        return _pack(key, itemRegistry.destructionDigest(destruction));
    }

    function _signTransformation(ItemRegistry.ItemTransformation memory transformation, uint256 key)
        private
        returns (bytes memory)
    {
        return _pack(key, itemRegistry.transformationDigest(transformation));
    }

    function _signBinding(CharacterItemBinding.BindingRequest memory request, uint256 key)
        private
        returns (bytes memory)
    {
        return _pack(key, binding.bindingDigest(request));
    }

    function _pack(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertEq(uint256 left, uint256 right, string memory label) private pure {
        require(left == right, label);
    }

    function _assertEq(bytes32 left, bytes32 right, string memory label) private pure {
        require(left == right, label);
    }

    function _assertTrue(bool condition, string memory label) private pure {
        require(condition, label);
    }
}
