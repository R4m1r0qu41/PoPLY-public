// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CharacterNFT } from "../src/CharacterNFT.sol";
import { Licensing } from "../src/Licensing.sol";
import { Marketplace } from "../src/Marketplace.sol";
import { RoyaltyRegistry } from "../src/RoyaltyRegistry.sol";
import { StateRegistry } from "../src/StateRegistry.sol";
import { VerifierRegistry } from "../src/VerifierRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract PoPLYTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant VERIFIER_KEY = 0xA11CE;
    uint256 private constant UNTRUSTED_KEY = 0xBAD;

    address private admin = address(0xA0);
    address private player = address(0xB0);
    address private buyer = address(0xC0);
    address private licensee = address(0xD0);
    address private creator = address(0xE0);
    address private feeRecipient = address(0xF0);
    address private verifier;

    bytes32 private gameId = keccak256("poply.reference-arena.v1");
    bytes32 private publisherId = keccak256("cipherlayer.reference-publisher");
    bytes32 private policyId = keccak256("popl.policy.v1");

    VerifierRegistry private verifiers;
    StateRegistry private stateRegistry;
    CharacterNFT private characters;
    Licensing private licensing;
    Marketplace private marketplace;
    RoyaltyRegistry private royalties;

    function setUp() public {
        // A realistic wall-clock base so minted characters carry a non-zero mint timestamp
        // (the marketplace treats mintedAt == 0 as a spoofed/foreign character).
        vm.warp(1_700_000_000);
        verifier = vm.addr(VERIFIER_KEY);

        verifiers = new VerifierRegistry(admin);
        vm.prank(admin);
        verifiers.registerPublisher(publisherId, false, 0);

        stateRegistry = new StateRegistry(address(verifiers));
        royalties = new RoyaltyRegistry();
        // Deploy order: Licensing before CharacterNFT (the NFT takes an immutable license manager),
        // and the VerifierRegistry doubles as the publisher licensing policy.
        licensing = new Licensing(
            admin, address(stateRegistry), address(verifiers), feeRecipient, 250, 1
        );
        characters = new CharacterNFT(
            "PoPLY Arena Characters", "PAC", admin, address(royalties), address(licensing)
        );
        marketplace =
            new Marketplace(admin, address(licensing), address(stateRegistry), feeRecipient, 250);

        vm.prank(admin);
        verifiers.assignGame(gameId, publisherId);
        vm.prank(admin);
        verifiers.configureVerifier(verifier, publisherId, true);
        // Relax marketplace eligibility for the general tests; testMarketplaceListingRequiresEligibility
        // restores the production defaults and exercises the gate.
        vm.prank(admin);
        marketplace.configureListingEligibility(0, 0, 0);

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

    function testCheckpointAndAchievementLifecycle() public {
        StateRegistry.Checkpoint memory checkpoint = _checkpoint(1, 3_600, 2);
        bytes memory checkpointSignature = _signCheckpoint(checkpoint, VERIFIER_KEY);

        bytes32 digest = stateRegistry.submitCheckpoint(checkpoint, checkpointSignature);
        StateRegistry.CharacterState memory stored = stateRegistry.stateOf(address(characters), 1);

        _assertEq(stored.sequence, 1, "sequence");
        _assertEq(stored.playTimeSeconds, 3_600, "play time");
        _assertEq(stored.popl, 2, "PoPL");
        _assertEq(stored.checkpointDigest, digest, "checkpoint digest");

        StateRegistry.Achievement memory achievement = _achievement("FIRST_WIN");
        stateRegistry.submitAchievement(achievement, _signAchievement(achievement, VERIFIER_KEY));
        _assertTrue(
            stateRegistry.hasAchievement(address(characters), 1, achievement.achievementId),
            "achievement not recorded"
        );

        bytes memory duplicateSignature = _signAchievement(achievement, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.AchievementAlreadyRecorded.selector);
        stateRegistry.submitAchievement(achievement, duplicateSignature);
    }

    function testCheckpointHistoryCannotSkipOrRegress() public {
        StateRegistry.Checkpoint memory first = _checkpoint(1, 3_600, 2);
        stateRegistry.submitCheckpoint(first, _signCheckpoint(first, VERIFIER_KEY));

        StateRegistry.Checkpoint memory skipped = _checkpoint(3, 7_200, 3);
        bytes memory skippedSignature = _signCheckpoint(skipped, VERIFIER_KEY);
        vm.expectRevert(abi.encodeWithSelector(StateRegistry.InvalidSequence.selector, 2, 3));
        stateRegistry.submitCheckpoint(skipped, skippedSignature);

        StateRegistry.Checkpoint memory regressedTime = _checkpoint(2, 3_599, 3);
        bytes memory regressedTimeSignature = _signCheckpoint(regressedTime, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.PlayTimeDecreased.selector);
        stateRegistry.submitCheckpoint(regressedTime, regressedTimeSignature);

        StateRegistry.Checkpoint memory regressedPoPL = _checkpoint(2, 7_200, 1);
        bytes memory regressedPoPLSignature = _signCheckpoint(regressedPoPL, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.PoPLDecreased.selector);
        stateRegistry.submitCheckpoint(regressedPoPL, regressedPoPLSignature);
    }

    function testCheckpointTimeCannotRegress() public {
        vm.warp(1_000);
        StateRegistry.Checkpoint memory first = _checkpoint(1, 3_600, 2);
        stateRegistry.submitCheckpoint(first, _signCheckpoint(first, VERIFIER_KEY));

        StateRegistry.Checkpoint memory second = _checkpoint(2, 7_200, 3);
        second.occurredAt = first.occurredAt - 1;
        bytes memory signature = _signCheckpoint(second, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.OccurredAtDecreased.selector);
        stateRegistry.submitCheckpoint(second, signature);
    }

    function testOnlyActiveVerifierCanAttest() public {
        StateRegistry.Checkpoint memory checkpoint = _checkpoint(1, 3_600, 2);
        bytes memory untrustedSignature = _signCheckpoint(checkpoint, UNTRUSTED_KEY);
        vm.expectRevert(StateRegistry.UnauthorizedVerifier.selector);
        stateRegistry.submitCheckpoint(checkpoint, untrustedSignature);

        vm.prank(admin);
        verifiers.configureVerifier(verifier, publisherId, false);
        bytes memory revokedSignature = _signCheckpoint(checkpoint, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.UnauthorizedVerifier.selector);
        stateRegistry.submitCheckpoint(checkpoint, revokedSignature);
    }

    function testActiveLicenseLocksCharacterUntilExpiry() public {
        _qualifyForLicensing();
        uint64 duration = 7 days;
        vm.prank(player);
        uint256 offerId = licensing.createOffer(
            address(characters),
            1,
            licensee,
            Licensing.Mode.SeasonalBoss,
            1 ether,
            duration,
            uint64(block.timestamp + 1 days),
            keccak256("season-five-boss-terms"),
            true
        );

        vm.deal(licensee, 1 ether);
        vm.prank(licensee);
        licensing.acceptOffer{ value: 1 ether }(offerId);

        _assertTrue(
            licensing.isCharacterLocked(address(characters), 1), "character should be locked"
        );
        _assertEq(licensing.credits(player), 0.975 ether, "licensor proceeds");
        _assertEq(licensing.credits(feeRecipient), 0.025 ether, "license fee");

        vm.prank(player);
        vm.expectRevert(CharacterNFT.CharacterLocked.selector);
        characters.transferFrom(player, buyer, 1);

        vm.warp(block.timestamp + duration);
        _assertTrue(
            !licensing.isCharacterLocked(address(characters), 1), "expired license still locked"
        );
        vm.prank(player);
        characters.transferFrom(player, buyer, 1);
        _assertEq(characters.ownerOf(1), buyer, "owner after expiry");
    }

    function testMarketplaceSettlesSellerRoyaltyAndProtocolFee() public {
        vm.prank(player);
        characters.approve(address(marketplace), 1);
        vm.prank(player);
        uint256 listingId = marketplace.createListing(
            address(characters), 1, 2 ether, uint64(block.timestamp + 1 days)
        );

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        marketplace.buy{ value: 2 ether }(listingId);

        _assertEq(characters.ownerOf(1), buyer, "buyer ownership");
        _assertEq(marketplace.credits(player), 1.85 ether, "seller proceeds");
        _assertEq(marketplace.credits(creator), 0.1 ether, "creator royalty");
        _assertEq(marketplace.credits(feeRecipient), 0.05 ether, "market fee");
    }

    function testRoyaltyCannotBeRedirectedAfterMint() public {
        (address receiver, uint256 amount) = royalties.royaltyInfo(address(characters), 1, 2 ether);
        _assertEq(receiver, creator, "royalty receiver");
        _assertEq(amount, 0.1 ether, "royalty amount");

        vm.prank(address(characters));
        vm.expectRevert(RoyaltyRegistry.RoyaltyAlreadyConfigured.selector);
        royalties.configureRoyalty(1, buyer, 1_000);
    }

    function testLicenseCannotBeBypassedThroughMarketplace() public {
        _qualifyForLicensing();
        vm.prank(player);
        characters.approve(address(marketplace), 1);
        vm.prank(player);
        uint256 listingId = marketplace.createListing(
            address(characters), 1, 2 ether, uint64(block.timestamp + 10 days)
        );

        vm.prank(player);
        uint256 offerId = licensing.createOffer(
            address(characters),
            1,
            licensee,
            Licensing.Mode.NPC,
            0,
            1 days,
            uint64(block.timestamp + 1 days),
            keccak256("npc-terms"),
            true
        );
        vm.prank(licensee);
        licensing.acceptOffer(offerId);

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        vm.expectRevert(Marketplace.CharacterLocked.selector);
        marketplace.buy{ value: 2 ether }(listingId);
    }

    function testTransferInvalidatesStaleListing() public {
        vm.prank(player);
        characters.approve(address(marketplace), 1);
        vm.prank(player);
        uint256 listingId = marketplace.createListing(
            address(characters), 1, 2 ether, uint64(block.timestamp + 1 days)
        );

        vm.prank(player);
        characters.transferFrom(player, buyer, 1);

        vm.deal(licensee, 2 ether);
        vm.prank(licensee);
        vm.expectRevert(Marketplace.ListingUnavailable.selector);
        marketplace.buy{ value: 2 ether }(listingId);
    }

    function testOwnershipWithoutPoPLCannotCreateLicenseOffer() public {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Licensing.InsufficientPoPL.selector, 1, 0));
        licensing.createOffer(
            address(characters),
            1,
            licensee,
            Licensing.Mode.NPC,
            0,
            1 days,
            uint64(block.timestamp + 1 days),
            keccak256("npc-terms"),
            true
        );
    }

    function testVerifierCannotAttestForUnownedGame() public {
        bytes32 otherGame = keccak256("poply.other-studio.v1");
        vm.prank(admin);
        characters.mint(
            player, 2, otherGame, keccak256("meta-2"), "ipfs://poply-reference/2", creator, 500
        );

        StateRegistry.Checkpoint memory checkpoint = StateRegistry.Checkpoint({
            characterContract: address(characters),
            tokenId: 2,
            gameId: otherGame,
            sequence: 1,
            stateHash: keccak256("other-state"),
            playTimeSeconds: 3_600,
            popl: 1,
            policyId: policyId,
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 1 hours)
        });
        // The verifier belongs to publisherId, which does not own otherGame.
        bytes memory signature = _signCheckpoint(checkpoint, VERIFIER_KEY);
        vm.expectRevert(StateRegistry.UnauthorizedVerifier.selector);
        stateRegistry.submitCheckpoint(checkpoint, signature);
    }

    function testCheckpointRejectsImplausibleJumps() public {
        StateRegistry.Checkpoint memory bigTime = _checkpoint(1, 24 hours + 1, 2);
        bytes memory bigTimeSignature = _signCheckpoint(bigTime, VERIFIER_KEY);
        vm.expectRevert(
            abi.encodeWithSelector(
                StateRegistry.PlayTimeImplausible.selector, uint64(24 hours), uint64(24 hours + 1)
            )
        );
        stateRegistry.submitCheckpoint(bigTime, bigTimeSignature);

        StateRegistry.Checkpoint memory bigPopl = _checkpoint(1, 3_600, 33);
        bytes memory bigPoplSignature = _signCheckpoint(bigPopl, VERIFIER_KEY);
        vm.expectRevert(
            abi.encodeWithSelector(StateRegistry.PoPLImplausible.selector, uint16(32), uint16(33))
        );
        stateRegistry.submitCheckpoint(bigPopl, bigPoplSignature);
    }

    function testPublicOfferGatedByPublisherPolicy() public {
        _qualifyForLicensing();

        // Default publisher policy: no open licensing, no minimum price -> public offers rejected.
        vm.prank(player);
        vm.expectRevert(Licensing.PublicOfferNotAllowed.selector);
        licensing.createOffer(
            address(characters),
            1,
            address(0),
            Licensing.Mode.NPC,
            0,
            1 days,
            uint64(block.timestamp + 1 days),
            keccak256("public-terms"),
            true
        );

        // Publisher opts into open licensing -> public offer now permitted.
        vm.prank(admin);
        verifiers.registerPublisher(publisherId, true, 0);
        vm.prank(player);
        uint256 offerId = licensing.createOffer(
            address(characters),
            1,
            address(0),
            Licensing.Mode.NPC,
            0,
            1 days,
            uint64(block.timestamp + 1 days),
            keccak256("public-terms"),
            true
        );
        _assertTrue(offerId == 1, "public offer created");
    }

    function testMarketplaceListingRequiresEligibility() public {
        vm.prank(admin);
        marketplace.configureListingEligibility(30 days, 30 hours, 3);
        vm.prank(player);
        characters.approve(address(marketplace), 1);

        // Freshly minted, no play history -> ineligible.
        vm.prank(player);
        vm.expectRevert(Marketplace.NotEligibleForListing.selector);
        marketplace.createListing(
            address(characters), 1, 2 ether, uint64(block.timestamp + 60 days)
        );

        // Age the character past 30 days and accrue 30 hours of play at level 3.
        vm.warp(block.timestamp + 30 days);
        StateRegistry.Checkpoint memory first = _checkpoint(1, 24 hours, 3);
        stateRegistry.submitCheckpoint(first, _signCheckpoint(first, VERIFIER_KEY));
        StateRegistry.Checkpoint memory second = _checkpoint(2, 30 hours, 3);
        stateRegistry.submitCheckpoint(second, _signCheckpoint(second, VERIFIER_KEY));

        vm.prank(player);
        uint256 listingId = marketplace.createListing(
            address(characters), 1, 2 ether, uint64(block.timestamp + 60 days)
        );
        _assertTrue(listingId == 1, "eligible listing created");
    }

    function testNonExclusiveLicenseKeepsCharacterTradeable() public {
        _qualifyForLicensing();
        vm.prank(player);
        uint256 offerId = licensing.createOffer(
            address(characters),
            1,
            licensee,
            Licensing.Mode.PromotionalAppearance,
            1 ether,
            7 days,
            uint64(block.timestamp + 1 days),
            keccak256("promo-terms"),
            false
        );

        vm.deal(licensee, 1 ether);
        vm.prank(licensee);
        licensing.acceptOffer{ value: 1 ether }(offerId);

        // A non-exclusive grant does not immobilize the NFT...
        _assertTrue(
            !licensing.isCharacterLocked(address(characters), 1),
            "non-exclusive license should not lock"
        );

        // ...but the single active-license slot still blocks a second concurrent offer.
        vm.prank(player);
        vm.expectRevert(Licensing.CharacterAlreadyLocked.selector);
        licensing.createOffer(
            address(characters),
            1,
            licensee,
            Licensing.Mode.NPC,
            1 ether,
            1 days,
            uint64(block.timestamp + 1 days),
            keccak256("second-terms"),
            true
        );

        // The owner can still transfer/sell the non-exclusively licensed character.
        vm.prank(player);
        characters.transferFrom(player, buyer, 1);
        _assertEq(characters.ownerOf(1), buyer, "owner after transfer");
    }

    function _checkpoint(uint64 sequence, uint64 playTimeSeconds, uint16 popl)
        private
        view
        returns (StateRegistry.Checkpoint memory)
    {
        return StateRegistry.Checkpoint({
            characterContract: address(characters),
            tokenId: 1,
            gameId: gameId,
            sequence: sequence,
            stateHash: keccak256(abi.encode("state", sequence, playTimeSeconds, popl)),
            playTimeSeconds: playTimeSeconds,
            popl: popl,
            policyId: policyId,
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 1 hours)
        });
    }

    function _achievement(string memory name)
        private
        view
        returns (StateRegistry.Achievement memory)
    {
        return StateRegistry.Achievement({
            characterContract: address(characters),
            tokenId: 1,
            gameId: gameId,
            achievementId: keccak256(bytes(name)),
            evidenceHash: keccak256(abi.encode(name, "match-42")),
            occurredAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 1 hours)
        });
    }

    function _signCheckpoint(StateRegistry.Checkpoint memory checkpoint, uint256 privateKey)
        private
        returns (bytes memory)
    {
        bytes32 digest = stateRegistry.checkpointDigest(checkpoint);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signAchievement(StateRegistry.Achievement memory achievement, uint256 privateKey)
        private
        returns (bytes memory)
    {
        bytes32 digest = stateRegistry.achievementDigest(achievement);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _qualifyForLicensing() private {
        StateRegistry.Checkpoint memory checkpoint = _checkpoint(1, 3_600, 2);
        stateRegistry.submitCheckpoint(checkpoint, _signCheckpoint(checkpoint, VERIFIER_KEY));
    }

    function _assertTrue(bool value, string memory reason) private pure {
        require(value, reason);
    }

    function _assertEq(uint256 left, uint256 right, string memory reason) private pure {
        require(left == right, reason);
    }

    function _assertEq(address left, address right, string memory reason) private pure {
        require(left == right, reason);
    }

    function _assertEq(bytes32 left, bytes32 right, string memory reason) private pure {
        require(left == right, reason);
    }
}
